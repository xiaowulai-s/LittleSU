import { httpText, isTauri } from './env';
import type { LiveChannel } from './liveParser';

/**
 * 直播节目单（EPG）。
 * 数据来自 51zmt 的 DIYP 接口：按频道名 + 日期返回当天节目，单频道约 3KB，适合移动端按需拉取。
 * 接口只有 HTTP，走 Tauri 原生请求；浏览器预览会被 CORS / 混合内容拦截。
 */

const API = 'http://epg.51zmt.top:8000/api/diyp/';
const CACHE_TTL = 10 * 60 * 1000;

export interface EpgProgram {
  start: string;
  end: string;
  title: string;
}

export interface EpgResult {
  channelName: string;
  date: string;
  programs: EpgProgram[];
}

const cache = new Map<string, { at: number; value: EpgResult | null }>();

export function clearEpgCache(): void {
  cache.clear();
}

/** 本地日期（YYYY-MM-DD），offset 为天数偏移。 */
export function epgDate(offset = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** 频道名候选：优先 tvg-id（去掉国家后缀），其次去掉清晰度后缀的频道名。 */
export function epgCandidates(channel: Pick<LiveChannel, 'name' | 'tvgId'>): string[] {
  const list: string[] = [];
  const id = channel.tvgId.trim().replace(/@.*$/, '').replace(/\.(cn|hk|tw|mo)$/i, '');
  if (id) list.push(id);
  const name = channel.name.replace(/\s+/g, '').replace(/(高清|超清|蓝光|标清|4K|HD|FHD)$/i, '');
  if (name && !list.includes(name)) list.push(name);
  return list;
}

function sanitizeTitle(raw: string): string {
  return raw.replace(/\s*--\s*免费使用.*$/i, '').trim();
}

export async function fetchEpg(
  channel: Pick<LiveChannel, 'name' | 'tvgId'>,
  date: string,
): Promise<EpgResult | null> {
  if (!isTauri()) throw new Error('节目单需要在客户端内加载');
  for (const candidate of epgCandidates(channel)) {
    const key = `${candidate}|${date}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) {
      if (hit.value) return hit.value;
      continue;
    }
    try {
      const text = await httpText(`${API}?ch=${encodeURIComponent(candidate)}&date=${date}`, { timeoutSecs: 15 });
      const data = JSON.parse(text) as {
        channel_name?: string;
        epg_data?: { start?: string; end?: string; title?: string }[];
      };
      const programs: EpgProgram[] = (data.epg_data ?? [])
        .map((item) => ({
          start: (item.start ?? '').trim(),
          end: (item.end ?? '').trim(),
          title: sanitizeTitle(item.title ?? ''),
        }))
        .filter((item) => item.start && item.end && item.title);
      const value: EpgResult | null = programs.length
        ? { channelName: data.channel_name || candidate, date, programs }
        : null;
      cache.set(key, { at: Date.now(), value });
      if (value) return value;
    } catch {
      /* 换下一个候选名 */
    }
  }
  return null;
}

function nowHHMM(now: Date): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** 当前正在播出的节目（仅当天；跨零点节目按“结束时间小于开始时间”判断）。 */
export function currentProgram(programs: EpgProgram[], now = new Date()): EpgProgram | undefined {
  const at = nowHHMM(now);
  return programs.find((program) =>
    program.end > program.start
      ? program.start <= at && at < program.end
      : at >= program.start || at < program.end,
  );
}

export function nextProgram(programs: EpgProgram[], now = new Date()): EpgProgram | undefined {
  const at = nowHHMM(now);
  return programs.find((program) => program.start > at);
}
