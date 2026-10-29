const KEY = 'lsu.searchHistory';
const MAX = 12;

/** 新搜索置顶、去重、最多保留 12 条。 */
export function mergeSearchHistory(list: string[], query: string): string[] {
  const text = query.trim();
  if (!text) return list;
  return [text, ...list.filter((item) => item !== text)].slice(0, MAX);
}

export function loadSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === 'string' && item.trim()).slice(0, MAX);
  } catch {
    return [];
  }
}

export function saveSearchHistory(list: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* ignore */
  }
}

export function clearSearchHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
