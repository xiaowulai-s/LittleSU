import { httpText, isTauri } from './env';
import type { LiveChannel } from './liveParser';
import { normalizeChannelName } from './liveChannel';

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
const xmlCache = new Map<string, { at: number; text: string }>();
const xmltvCache = new Map<string, { at: number; value: EpgResult | null }>();
const XML_CACHE_TTL = 30 * 60 * 1000;
const XML_MAX_LENGTH = 30 * 1024 * 1024;

export function clearEpgCache(): void {
  cache.clear();
  xmlCache.clear();
  xmltvCache.clear();
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

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function xmltvTime(raw: string): { date: string; time: string } | null {
  const match = raw.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!match) return null;
  return { date: `${match[1]}${match[2]}${match[3]}`, time: `${match[4]}:${match[5]}` };
}

function attr(attrs: string, name: string): string {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

/** 解析 XMLTV，按 tvg-id/频道名高置信匹配；返回指定日期的节目。 */
export function parseXmltv(
  xml: string,
  channel: Pick<LiveChannel, 'name' | 'tvgId'>,
  date: string,
): EpgResult | null {
  const candidates = epgCandidates(channel).map(normalizeChannelName).filter(Boolean);
  if (!candidates.length) return null;

  const channelNames = new Map<string, string[]>();
  const channelPattern = /<channel\b([^>]*)>([\s\S]*?)<\/channel>/gi;
  let channelMatch: RegExpExecArray | null;
  while ((channelMatch = channelPattern.exec(xml))) {
    const id = attr(channelMatch[1], 'id');
    if (!id) continue;
    const names = Array.from(channelMatch[2].matchAll(/<display-name[^>]*>([\s\S]*?)<\/display-name>/gi))
      .map((item) => decodeXml(item[1]).trim())
      .filter(Boolean);
    channelNames.set(id, names);
  }

  const matched = new Set<string>();
  for (const [id, names] of channelNames) {
    const keys = [id, ...names].map(normalizeChannelName).filter(Boolean);
    if (keys.some((key) => candidates.includes(key))) matched.add(id);
  }
  if (!matched.size) {
    for (const [id, names] of channelNames) {
      const keys = [id, ...names].map(normalizeChannelName).filter((key) => key.length >= 3);
      const loose = (key: string, candidate: string) => key === candidate
        || (key.startsWith(candidate) && !/^\d/.test(key.slice(candidate.length)));
      if (keys.some((key) => candidates.some((candidate) => loose(key, candidate)))) {
        matched.add(id);
      }
    }
  }
  if (!matched.size) return null;

  const targetDate = date.replace(/-/g, '');
  const programs: EpgProgram[] = [];
  const programPattern = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
  let programMatch: RegExpExecArray | null;
  while ((programMatch = programPattern.exec(xml))) {
    if (!matched.has(attr(programMatch[1], 'channel'))) continue;
    const start = xmltvTime(attr(programMatch[1], 'start'));
    const stop = xmltvTime(attr(programMatch[1], 'stop'));
    if (!start || start.date !== targetDate) continue;
    const titleMatch = programMatch[2].match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? sanitizeTitle(decodeXml(titleMatch[1]).replace(/<[^>]+>/g, '').trim()) : '';
    if (!title) continue;
    programs.push({ start: start.time, end: stop?.time || start.time, title });
  }
  programs.sort((a, b) => a.start.localeCompare(b.start));
  if (!programs.length) return null;

  const matchedName = matched.values().next().value as string | undefined;
  const displayName = matchedName ? channelNames.get(matchedName)?.[0] : undefined;
  return { channelName: displayName || channel.name, date, programs };
}

export async function fetchXmltvEpg(
  url: string,
  channel: Pick<LiveChannel, 'name' | 'tvgId'>,
  date: string,
): Promise<EpgResult | null> {
  if (!isTauri()) throw new Error('节目单需要在客户端内加载');
  if (!/^https?:\/\//i.test(url)) throw new Error('自定义 EPG 地址无效');

  const parsedKey = `${url}|${epgCandidates(channel).join(',')}|${date}`;
  const parsedHit = xmltvCache.get(parsedKey);
  if (parsedHit && Date.now() - parsedHit.at < XML_CACHE_TTL) return parsedHit.value;

  let text = '';
  const rawHit = xmlCache.get(url);
  if (rawHit && Date.now() - rawHit.at < XML_CACHE_TTL) {
    text = rawHit.text;
  } else {
    text = await httpText(url, { timeoutSecs: 30 });
    if (text.length > XML_MAX_LENGTH) throw new Error('自定义 EPG 文件过大（>30MB）');
    xmlCache.set(url, { at: Date.now(), text });
  }
  const value = parseXmltv(text, channel, date);
  xmltvCache.set(parsedKey, { at: Date.now(), value });
  return value;
}

export async function fetchEpg(
  channel: Pick<LiveChannel, 'name' | 'tvgId'>,
  date: string,
  customUrl = '',
): Promise<EpgResult | null> {
  if (!isTauri()) throw new Error('节目单需要在客户端内加载');
  if (customUrl.trim()) {
    try {
      const custom = await fetchXmltvEpg(customUrl.trim(), channel, date);
      if (custom) return custom;
    } catch {
      /* 自定义 EPG 失败时回退到 51zmt */
    }
  }
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
