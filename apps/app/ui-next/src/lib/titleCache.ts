import type { Title } from '../data';

const cache = new Map<string, Title>();

export function cacheTitle(title: Title): string {
  const key = title.key ?? title.id;
  cache.set(key, title);
  return key;
}

export function cacheTitles(list: Title[]): void {
  list.forEach((title) => cacheTitle(title));
}

export function getCachedTitle(key: string | undefined): Title | undefined {
  if (!key) return undefined;
  return cache.get(key);
}

export function clearTitleCache(): void {
  cache.clear();
}

export function findAnyTitle(key: string | undefined, mockTitles: Title[]): Title | undefined {
  if (!key) return undefined;
  return cache.get(key) ?? mockTitles.find((t) => t.id === key);
}