export interface QualityLevelInfo {
  height?: number;
  bitrate?: number;
}

/**
 * 选出目标清晰度对应的档位：
 * 1. 优先精确匹配高度（1080 → 1080）；
 * 2. 否则取不高于目标的最大档（4K 源里找 1080 → 720）；
 * 3. 没有可用档返回 -1（自动）。
 */
export function pickQualityLevel(levels: QualityLevelInfo[], wantedHeight: number): number {
  if (!levels.length || !wantedHeight) return -1;
  const exact = levels.findIndex((level) => level.height === wantedHeight);
  if (exact >= 0) return exact;
  let best = -1;
  let bestHeight = 0;
  levels.forEach((level, index) => {
    const height = level.height || 0;
    if (height && height <= wantedHeight && height > bestHeight) {
      best = index;
      bestHeight = height;
    }
  });
  return best;
}

export function qualityLabel(level: QualityLevelInfo, index: number): string {
  if (level.height) return `${level.height}P`;
  if (level.bitrate) return `${Math.round(level.bitrate / 1000)} kbps`;
  return `线路 ${index + 1}`;
}
