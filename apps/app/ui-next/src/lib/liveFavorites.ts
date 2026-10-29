export interface LiveFavorite {
  sourceKey: string;
  channelId: string;
  name: string;
  group: string;
  logo?: string;
  at: number;
}

const KEY = 'lsu.liveFavorites';
const MAX = 30;

export function mergeLiveFavorite(list: LiveFavorite[], item: Omit<LiveFavorite, 'at'>): LiveFavorite[] {
  const exists = list.some((favorite) => favorite.sourceKey === item.sourceKey && favorite.channelId === item.channelId);
  if (exists) {
    return list.filter((favorite) => !(favorite.sourceKey === item.sourceKey && favorite.channelId === item.channelId));
  }
  return [{ ...item, at: Date.now() }, ...list].slice(0, MAX);
}

export function loadLiveFavorites(): LiveFavorite[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.sourceKey === 'string' && typeof item.channelId === 'string' && typeof item.name === 'string')
      .map((item) => ({
        sourceKey: item.sourceKey,
        channelId: item.channelId,
        name: item.name,
        group: typeof item.group === 'string' ? item.group : '',
        logo: typeof item.logo === 'string' ? item.logo : undefined,
        at: Number(item.at) || 0,
      }))
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function saveLiveFavorites(list: LiveFavorite[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* ignore */
  }
}
