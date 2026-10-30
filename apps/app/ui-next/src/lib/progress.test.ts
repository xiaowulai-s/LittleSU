import { describe, expect, it } from 'vitest';
import { mergeEpisodeProgress, resumePositionFor } from './progress';

describe('mergeEpisodeProgress', () => {
  it('updates the current episode without dropping others', () => {
    const map = { 第1集: { position: 120, duration: 2700, progress: 4, at: 1 } };
    const next = mergeEpisodeProgress(map, '第2集', { position: 30, duration: 2700, progress: 1 }, 99);
    expect(next['第1集'].position).toBe(120);
    expect(next['第2集']).toEqual({ position: 30, duration: 2700, progress: 1, at: 99 });
  });

  it('ignores an empty episode name', () => {
    const map = { 第1集: { position: 120, duration: 2700, progress: 4, at: 1 } };
    expect(mergeEpisodeProgress(map, '  ', { position: 0, duration: 0, progress: 0 })).toBe(map);
  });

  it('caps the map to the 200 most recent episodes', () => {
    const map: Record<string, { position: number; duration: number; progress: number; at: number }> = {};
    for (let i = 0; i < 200; i += 1) map[`第${i}集`] = { position: 1, duration: 1, progress: 1, at: i };
    const next = mergeEpisodeProgress(map, '第200集', { position: 1, duration: 1, progress: 1 }, 1000);
    expect(Object.keys(next)).toHaveLength(200);
    expect(next['第200集'].at).toBe(1000);
    expect(next['第0集']).toBeUndefined();
  });
});

describe('resumePositionFor', () => {
  it('prefers the saved position of the current episode', () => {
    const map = { 第2集: { position: 600, duration: 2700, progress: 22, at: 1 } };
    expect(resumePositionFor(map, '第2集', 30)).toBe(600);
  });

  it('falls back for an unwatched episode and ignores tiny positions', () => {
    const map = { 第2集: { position: 5, duration: 2700, progress: 0, at: 1 } };
    expect(resumePositionFor(map, '第2集', 0)).toBe(0);
    expect(resumePositionFor(undefined, '第2集', 420)).toBe(420);
  });
});
