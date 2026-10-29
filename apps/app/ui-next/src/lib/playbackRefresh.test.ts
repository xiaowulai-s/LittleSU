import { describe, expect, it } from 'vitest';
import { isExpiredStreamError, selectRefreshedEpisode } from './playbackRefresh';
import type { Title } from '../data';

const title = (lines?: { name: string; episodes: { name: string; url: string }[] }[], episodes?: { name: string; url: string }[]): Title => ({
  id: 'demo',
  key: 'demo',
  name: '示例',
  en: '',
  type: '剧集',
  year: 2026,
  rating: 0,
  region: '',
  poster: '',
  quality: 'HD',
  synopsis: '',
  episodes: episodes?.length ?? 0,
  duration: '45 分钟',
  source: '示例源',
  genres: [],
  hue: 0,
  playLines: lines,
  episodesList: episodes,
});

describe('isExpiredStreamError', () => {
  it('detects 401/403 status codes', () => {
    expect(isExpiredStreamError('manifestLoadError', 403)).toBe(true);
    expect(isExpiredStreamError(undefined, 401)).toBe(true);
  });

  it('detects network load details but not parsing errors', () => {
    expect(isExpiredStreamError('manifestLoadError')).toBe(true);
    expect(isExpiredStreamError('levelLoadTimeOut')).toBe(true);
    expect(isExpiredStreamError('manifestParsingError')).toBe(false);
  });
});

describe('selectRefreshedEpisode', () => {
  it('matches line and episode by name when line order changes', () => {
    const fresh = title([
      { name: '备用', episodes: [{ name: '第 1 集', url: 'https://cdn/b/1.m3u8' }] },
      { name: '量子', episodes: [{ name: '第 1 集', url: 'https://cdn/a/1.m3u8' }, { name: '第 2 集', url: 'https://cdn/a/2.m3u8' }] },
    ]);
    expect(
      selectRefreshedEpisode(fresh, { lineIndex: 0, lineName: '量子', episodeIndex: 0, episodeName: '第 2 集' }),
    ).toEqual({ lineIndex: 1, episodeIndex: 1, url: 'https://cdn/a/2.m3u8' });
  });

  it('falls back to the original indexes for single-line titles', () => {
    const fresh = title(undefined, [
      { name: '正片', url: 'https://cdn/1.m3u8' },
      { name: '花絮', url: 'https://cdn/2.m3u8' },
    ]);
    expect(selectRefreshedEpisode(fresh, { lineIndex: 0, episodeIndex: 1 })).toEqual({
      lineIndex: 0,
      episodeIndex: 1,
      url: 'https://cdn/2.m3u8',
    });
  });

  it('returns null when no playable url is available', () => {
    const fresh = title(undefined, [{ name: '正片', url: '' }]);
    expect(selectRefreshedEpisode(fresh, { lineIndex: 0, episodeIndex: 0 })).toBeNull();
  });
});
