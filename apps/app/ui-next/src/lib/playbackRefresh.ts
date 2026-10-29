import type { Title } from '../data';

export interface RefreshedEpisode {
  lineIndex: number;
  episodeIndex: number;
  url: string;
}

/** 网络类致命错误通常意味着签名地址过期或临时失效，值得重新拉取详情。 */
export function isExpiredStreamError(details?: string, status?: number): boolean {
  if (status === 401 || status === 403) return true;
  const text = (details || '').toLowerCase();
  return (
    text.includes('manifestloaderror') ||
    text.includes('levelloaderror') ||
    text.includes('fragloaderror') ||
    text.includes('timeout')
  );
}

/**
 * 在刷新后的详情里定位当前线路与剧集：优先按名称匹配（线路顺序可能变化），
 * 名称缺失时回落到原下标；找不到可用地址返回 null。
 */
export function selectRefreshedEpisode(
  fresh: Title,
  current: { lineIndex: number; lineName?: string; episodeIndex: number; episodeName?: string },
): RefreshedEpisode | null {
  const lines = fresh.playLines?.length ? fresh.playLines : [];
  let lineIndex = 0;
  let episodes = fresh.episodesList ?? [];
  if (lines.length) {
    const byName = current.lineName ? lines.findIndex((line) => line.name === current.lineName) : -1;
    lineIndex = byName >= 0 ? byName : Math.min(Math.max(current.lineIndex, 0), lines.length - 1);
    episodes = lines[lineIndex]?.episodes ?? [];
  }
  if (!episodes.length) return null;
  const byName = current.episodeName ? episodes.findIndex((episode) => episode.name === current.episodeName) : -1;
  const episodeIndex = byName >= 0 ? byName : Math.min(Math.max(current.episodeIndex, 0), episodes.length - 1);
  const url = episodes[episodeIndex]?.url;
  if (!url) return null;
  return { lineIndex, episodeIndex, url };
}
