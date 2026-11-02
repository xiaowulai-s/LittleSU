import { channelKey } from './liveChannel';

export interface LiveRecent {
  key: string;
  name: string;
  group: string;
  sourceKey: string;
  sourceName?: string;
  channelId: string;
  logo?: string;
  at: number;
}

const KEY = 'lsu.liveRecent';
const MAX = 20;

function recentKey(item: Pick<LiveRecent, 'name' | 'key'>): string {
  return item.key || channelKey({ name: item.name, tvgId: '' });
}

export function recordLiveRecent(list: LiveRecent[], item: Omit<LiveRecent, 'at' | 'key'>): LiveRecent[] {
  const key = channelKey({ name: item.name, tvgId: '' }) || `${item.sourceKey}:${item.channelId}`;
  const next = [{ ...item, key, at: Date.now() }, ...list.filter((entry) => recentKey(entry) !== key)];
  return next.slice(0, MAX);
}

export function loadLiveRecent(): LiveRecent[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.name === 'string' && typeof item.sourceKey === 'string' && typeof item.channelId === 'string')
      .map((item) => ({
        key: typeof item.key === 'string' && item.key ? item.key : channelKey({ name: item.name, tvgId: '' }),
        name: item.name,
        group: typeof item.group === 'string' ? item.group : '',
        sourceKey: item.sourceKey,
        sourceName: typeof item.sourceName === 'string' ? item.sourceName : undefined,
        channelId: item.channelId,
        logo: typeof item.logo === 'string' ? item.logo : undefined,
        at: Number(item.at) || 0,
      }))
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function saveLiveRecent(list: LiveRecent[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* ignore */
  }
}
