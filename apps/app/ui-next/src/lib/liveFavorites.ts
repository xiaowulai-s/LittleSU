import { channelKey } from './liveChannel';

export interface LiveFavorite {
  sourceKey: string;
  channelId: string;
  name: string;
  group: string;
  logo?: string;
  key?: string;
  at: number;
}

const KEY = 'lsu.liveFavorites';
const MAX = 30;

export function favoriteKey(favorite: Pick<LiveFavorite, 'key' | 'name'>): string {
  return favorite.key || channelKey({ name: favorite.name, tvgId: '' });
}

function dedupe(list: LiveFavorite[]): LiveFavorite[] {
  const seen = new Set<string>();
  return list.filter((favorite) => {
    const key = favoriteKey(favorite);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 同一频道跨源只保留一个收藏；再次收藏则取消。 */
export function mergeLiveFavorite(list: LiveFavorite[], item: Omit<LiveFavorite, 'at' | 'key'>): LiveFavorite[] {
  const key = channelKey({ name: item.name, tvgId: '' }) || `${item.sourceKey}:${item.channelId}`;
  const exists = list.some((favorite) => favoriteKey(favorite) === key);
  if (exists) return dedupe(list.filter((favorite) => favoriteKey(favorite) !== key));
  return dedupe([{ ...item, key, at: Date.now() }, ...list]).slice(0, MAX);
}

export function favoriteMatchesChannel(
  favorite: Pick<LiveFavorite, 'key' | 'name'>,
  channel: { name: string; tvgId?: string },
): boolean {
  return favoriteKey(favorite) === channelKey({ name: channel.name, tvgId: channel.tvgId || '' });
}

export function loadLiveFavorites(): LiveFavorite[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return dedupe(parsed
      .filter((item) => item && typeof item.sourceKey === 'string' && typeof item.channelId === 'string' && typeof item.name === 'string')
      .map((item) => ({
        sourceKey: item.sourceKey,
        channelId: item.channelId,
        name: item.name,
        group: typeof item.group === 'string' ? item.group : '',
        logo: typeof item.logo === 'string' ? item.logo : undefined,
        key: typeof item.key === 'string' && item.key ? item.key : channelKey({ name: item.name, tvgId: '' }),
        at: Number(item.at) || 0,
      }))).slice(0, MAX);
  } catch {
    return [];
  }
}

export function saveLiveFavorites(list: LiveFavorite[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(dedupe(list).slice(0, MAX)));
  } catch {
    /* ignore */
  }
}
