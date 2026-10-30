import type { EpisodeProgress } from './storage';

export interface EpisodeSnapshot {
  position: number;
  duration: number;
  progress: number;
}

const MAX_EPISODES = 200;

/** 写入当前剧集进度并保留其他剧集；条目过多时保留最近观看的 200 集。 */
export function mergeEpisodeProgress(
  map: Record<string, EpisodeProgress> | undefined,
  name: string | undefined,
  snapshot: EpisodeSnapshot,
  now = Date.now(),
): Record<string, EpisodeProgress> {
  const key = (name || '').trim();
  if (!key) return map ?? {};
  const next: Record<string, EpisodeProgress> = {
    ...(map ?? {}),
    [key]: { ...snapshot, at: now },
  };
  const entries = Object.entries(next);
  if (entries.length <= MAX_EPISODES) return next;
  entries.sort((a, b) => b[1].at - a[1].at);
  return Object.fromEntries(entries.slice(0, MAX_EPISODES));
}

/** 取当前剧集的续播位置；没有该集记录时回落到旧版单一进度。 */
export function resumePositionFor(
  map: Record<string, EpisodeProgress> | undefined,
  name: string | undefined,
  fallback = 0,
): number {
  const saved = name ? map?.[name] : undefined;
  if (saved && Number.isFinite(saved.position) && saved.position > 10) return saved.position;
  return Number.isFinite(fallback) && fallback > 10 ? fallback : 0;
}
