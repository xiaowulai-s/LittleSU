export interface CustomLiveSource {
  name: string;
  url: string;
  enabled?: boolean;
}

const KEY = 'lsu.liveSources';

export function loadCustomLiveSources(): CustomLiveSource[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.url === 'string' && /^https?:\/\//i.test(item.url))
      .map((item) => ({
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : item.url,
        url: String(item.url).replace(/\/+$/, ''),
        enabled: item.enabled !== false,
      }));
  } catch {
    return [];
  }
}

export function saveCustomLiveSources(list: CustomLiveSource[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
