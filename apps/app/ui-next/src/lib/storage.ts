import type { Title } from '../data';

export const KEYS = {
  selected: 'selectedAPIs',
  custom: 'customAPIs',
  initialized: 'hasInitializedDefaults',
  history: 'viewingHistory',
  historyV2: 'lsu.history.v2',
  favorites: 'lsu.favorites',
  theme: 'lsu.theme',
  settings: 'lsu.settings',
  health: 'lsu.health',
  searchView: 'lsu.searchView',
} as const;

export interface HistoryRecord {
  key: string;
  name: string;
  poster?: string;
  sourceName?: string;
  sourceKey?: string;
  vodId?: string;
  playUrl?: string;
  episodeName?: string;
  episodeIndex?: number;
  position: number;
  duration: number;
  timestamp: number;
  progress: number;
}

export type FavoriteRecord = Pick<
  Title,
  'id' | 'name' | 'poster' | 'year' | 'rating' | 'type' | 'genres' | 'source' | 'quality'
> & { key: string; sourceKey?: string; vodId?: string; savedAt: number };

export interface PlaybackSettings {
  autoNext: boolean;
  remember: boolean;
  adFilter: boolean;
  quality: string;
  density: 'comfortable' | 'compact' | 'wide';
  volume: number;
  autoSwitchSource: boolean;
  speed: number;
  fitMode: 'contain' | 'cover';
  keepAwake: boolean;
  searchTimeoutSecs: number;
  searchRetries: number;
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** 迁移旧版 viewingHistory（title/directVideoUrl/playbackPosition...）。 */
export function loadHistory(): HistoryRecord[] {
  const v2 = readJson<HistoryRecord[] | null>(KEYS.historyV2, null);
  if (Array.isArray(v2) && v2.length) return v2;
  const legacy = readJson<Array<Record<string, unknown>>>(KEYS.history, []);
  if (!Array.isArray(legacy) || !legacy.length) return [];
  const migrated = legacy
    .map((item, index): HistoryRecord | null => {
      const name = typeof item.title === 'string' ? item.title : '';
      if (!name) return null;
      const timestamp = Number(item.timestamp) || Date.now() - index * 1000;
      const position = Number(item.playbackPosition) || 0;
      const duration = Number(item.duration) || 0;
      return {
        key: `hist:${timestamp}`,
        name,
        sourceName: typeof item.sourceName === 'string' ? item.sourceName : undefined,
        playUrl: typeof item.directVideoUrl === 'string' ? item.directVideoUrl : undefined,
        episodeIndex: Number(item.episodeIndex) || 0,
        position,
        duration,
        timestamp,
        progress: duration > 0 ? Math.min(100, Math.round((position / duration) * 100)) : 0,
      };
    })
    .filter((item): item is HistoryRecord => Boolean(item));
  writeJson(KEYS.historyV2, migrated);
  return migrated;
}

export function saveHistory(records: HistoryRecord[]): void {
  writeJson(KEYS.historyV2, records.slice(0, 60));
}

export function upsertHistory(record: HistoryRecord): HistoryRecord[] {
  const list = loadHistory().filter((item) => item.key !== record.key && item.name !== record.name);
  list.unshift(record);
  saveHistory(list);
  return list.slice(0, 60);
}

export function loadFavorites(): FavoriteRecord[] {
  const list = readJson<FavoriteRecord[]>(KEYS.favorites, []);
  return Array.isArray(list) ? list : [];
}

export function saveFavorites(list: FavoriteRecord[]): void {
  writeJson(KEYS.favorites, list);
}

export function loadTheme(): 'dark' | 'light' | 'system' {
  const value = readJson<string>(KEYS.theme, 'dark');
  return value === 'light' || value === 'system' ? value : 'dark';
}

export function saveTheme(theme: string): void {
  writeJson(KEYS.theme, theme);
}

export function loadSettings(): PlaybackSettings {
  const defaults: PlaybackSettings = {
    autoNext: true,
    remember: true,
    adFilter: true,
    quality: '自动',
    density: 'comfortable',
    volume: 0.8,
    autoSwitchSource: true,
    speed: 1,
    fitMode: 'contain',
    keepAwake: true,
    searchTimeoutSecs: 12,
    searchRetries: 0,
  };
  return { ...defaults, ...readJson<Partial<PlaybackSettings>>(KEYS.settings, {}) };
}

export function saveSettings(settings: PlaybackSettings): void {
  writeJson(KEYS.settings, settings);
}

export type SearchView = 'grid' | 'list';

export function loadSearchView(): SearchView {
  return readJson<string>(KEYS.searchView, 'grid') === 'list' ? 'list' : 'grid';
}

export function saveSearchView(view: SearchView): void {
  writeJson(KEYS.searchView, view);
}

export const HISTORY_LIMIT = 60;