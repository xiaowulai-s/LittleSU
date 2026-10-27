import type { SourceStatus } from '../data';

export const SEARCH_PATH = '/api.php/provide/vod/?ac=videolist&wd=';
export const DETAIL_PATH = '/api.php/provide/vod/?ac=videolist&ids=';

export interface SourceDef {
  key: string;
  name: string;
  host: string;
  base: string;
  status: SourceStatus;
  latency: number;
  note?: string;
  custom?: boolean;
}

export const SOURCES: SourceDef[] = [
  { key: 'lzi', name: '量子资源', host: 'cj.lziapi.com', base: 'https://cj.lziapi.com', status: 'ok', latency: 320 },
  { key: 'ffzy', name: '非凡影视', host: 'ffzy5.tv', base: 'http://ffzy5.tv', status: 'ok', latency: 410 },
  { key: 'ffzyapi', name: '非凡资源', host: 'cj.ffzyapi.com', base: 'https://cj.ffzyapi.com', status: 'ok', latency: 380 },
  { key: 'bfzy', name: '暴风资源', host: 'bfzyapi.com', base: 'https://bfzyapi.com', status: 'ok', latency: 520 },
  { key: 'zy360', name: '360资源', host: '360zy.com', base: 'https://360zy.com', status: 'ok', latency: 610 },
  { key: 'dyttzy', name: '电影天堂', host: 'caiji.dyttzyapi.com', base: 'http://caiji.dyttzyapi.com', status: 'ok', latency: 450 },
  { key: 'jisu', name: '极速资源', host: 'jszyapi.com', base: 'https://jszyapi.com', status: 'ok', latency: 560 },
  { key: 'zuid', name: '最大资源', host: 'api.zuidapi.com', base: 'https://api.zuidapi.com', status: 'ok', latency: 700 },
  { key: 'tyyszy', name: '天涯资源', host: 'tyyszy.com', base: 'https://tyyszy.com', status: 'ok', latency: 840 },
  { key: 'lovedan', name: '艾旦资源', host: 'lovedan.net', base: 'http://lovedan.net', status: 'ok', latency: 920 },
  { key: 'xiaomaomi', name: '小猫咪资源', host: 'zy.xiaomaomi.cc', base: 'https://zy.xiaomaomi.cc', status: 'backup', latency: -1, note: '当前 502' },
  { key: 'ruyi', name: '如意资源', host: 'cj.rycjapi.com', base: 'https://cj.rycjapi.com', status: 'backup', latency: -1, note: '当前不可达' },
  { key: 'dbzy', name: '豆瓣资源', host: 'dbzy.com', base: 'https://dbzy.com', status: 'backup', latency: -1, note: '当前超时' },
  { key: 'mozhua', name: '魔爪资源', host: 'mozhuazy.com', base: 'https://mozhuazy.com', status: 'backup', latency: -1, note: '当前不可达' },
  { key: 'yinghua', name: '樱花资源', host: 'm3u8.apiyhzy.com', base: 'https://m3u8.apiyhzy.com', status: 'backup', latency: -1, note: '当前 403' },
  { key: 'wwzy', name: '旺旺短剧', host: 'wwzy.tv', base: 'https://wwzy.tv', status: 'backup', latency: -1, note: '当前超时' },
  { key: 'ikun', name: 'iKun资源', host: 'ikunzyapi.com', base: 'https://ikunzyapi.com', status: 'backup', latency: -1, note: '当前不可达' },
  { key: 'zuidazy', name: '最大资源2', host: 'zuidazy.me', base: 'http://zuidazy.me', status: 'backup', latency: 1100, note: '与最大资源同源' },
  { key: 'ffzy2', name: '非凡2', host: 'ffzy.tv', base: 'https://ffzy.tv', status: 'backup', latency: 760, note: '与非凡资源同源' },
  { key: 'hongniu', name: '红牛资源', host: 'hongniuzy2.com', base: 'https://www.hongniuzy2.com', status: 'backup', latency: 860, note: '详情接口异常' },
  { key: 'subocj', name: '速播资源', host: 'subocj.com', base: 'https://subocj.com', status: 'backup', latency: -1, note: '当前超时' },
  { key: 'modu', name: '魔都资源', host: 'caiji.moduapi.cc', base: 'https://caiji.moduapi.cc', status: 'backup', latency: -1, note: '当前超时' },
  { key: 'heimuer', name: '黑木耳', host: 'json.heimuer.xyz', base: 'https://json.heimuer.xyz', status: 'experimental', latency: -1, note: '接口返回网页' },
  { key: 'wolong', name: '卧龙资源', host: 'wolongzyw.com', base: 'https://wolongzyw.com', status: 'experimental', latency: -1, note: '接口返回网页' },
  { key: 'hwba', name: '华为吧', host: 'cjhwba.com', base: 'https://cjhwba.com', status: 'experimental', latency: -1, note: '接口返回网页' },
];

export interface CustomApi {
  name: string;
  url: string;
  detail?: string;
  isAdult?: boolean;
}

export function defaultSelectedKeys(): string[] {
  return SOURCES.filter((s) => s.status === 'ok').map((s) => s.key);
}

export function loadCustomApis(): CustomApi[] {
  try {
    const raw = localStorage.getItem('customAPIs');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.url === 'string' && /^https?:\/\//i.test(item.url))
      .map((item) => ({
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : item.url,
        url: String(item.url).replace(/\/+$/, ''),
        detail: typeof item.detail === 'string' ? item.detail : '',
        isAdult: item.isAdult === true,
      }));
  } catch {
    return [];
  }
}

export function customDefs(customs: CustomApi[]): SourceDef[] {
  return customs.map((api, index) => ({
    key: `custom_${index}`,
    name: api.name,
    host: new URL(api.url).hostname,
    base: api.url,
    status: 'ok' as SourceStatus,
    latency: 0,
    custom: true,
  }));
}

export function loadSelectedKeys(): string[] {
  try {
    const raw = localStorage.getItem('selectedAPIs');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed.filter((x) => typeof x === 'string');
    }
  } catch {
    /* ignore */
  }
  return defaultSelectedKeys();
}

export function saveSelectedKeys(keys: string[]): void {
  try {
    localStorage.setItem('selectedAPIs', JSON.stringify(keys));
    if (!localStorage.getItem('hasInitializedDefaults')) {
      localStorage.setItem('hasInitializedDefaults', 'true');
    }
  } catch {
    /* ignore */
  }
}

export function saveCustomApis(apis: CustomApi[]): void {
  try {
    localStorage.setItem('customAPIs', JSON.stringify(apis));
  } catch {
    /* ignore */
  }
}

/** 源当前是否可用：有测活结果时以测活为准，否则回落内置状态（自定义源默认可用）。 */
export function isSourceHealthy(
  source: SourceDef,
  health: Record<string, { status: 'ok' | 'fail' } | undefined>,
): boolean {
  const probe = health[source.key];
  if (probe) return probe.status === 'ok';
  return source.custom === true || source.status === 'ok';
}

export function findSource(key: string, customs: CustomApi[] = []): SourceDef | undefined {
  const builtIn = SOURCES.find((s) => s.key === key);
  if (builtIn) return builtIn;
  return customDefs(customs).find((s) => s.key === key);
}

export function searchUrlFor(source: SourceDef, query: string, page = 1): string {
  const base = source.base.replace(/\/+$/, '');
  return `${base}${SEARCH_PATH}${encodeURIComponent(query)}&pg=${page}`;
}

export function detailUrlFor(source: SourceDef, id: string): string {
  const base = source.base.replace(/\/+$/, '');
  return `${base}${DETAIL_PATH}${encodeURIComponent(id)}`;
}

export function latestUrlFor(source: SourceDef, page = 1, typeId = ''): string {
  const base = source.base.replace(/\/+$/, '');
  const type = typeId ? `&t=${typeId}` : '';
  return `${base}/api.php/provide/vod/?ac=videolist&pg=${page}${type}`;
}