/**
 * 清理 HLS 播放列表中的广告痕迹：
 * - 去掉 #EXT-X-DISCONTINUITY（与旧版行为一致）
 * - 丢弃 URL 含明确广告段的切片及其 #EXTINF
 */
const AD_URI = /(?:^|[\/._-])(?:ad|ads|advert|advertisement|guanggao|sponsor)(?:[\/._-]|$)/i;

export function filterAdsFromM3U8(content: string): string {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  let pendingExtinf: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }
    if (trimmed.startsWith('#EXT-X-DISCONTINUITY')) continue;
    if (trimmed.startsWith('#EXTINF')) {
      pendingExtinf = line;
      continue;
    }
    if (trimmed.startsWith('#')) {
      out.push(line);
      continue;
    }
    // 媒体切片 / 子播放列表 URI
    if (AD_URI.test(trimmed)) {
      pendingExtinf = null;
      continue;
    }
    if (pendingExtinf !== null) {
      out.push(pendingExtinf);
      pendingExtinf = null;
    }
    out.push(line);
  }

  if (pendingExtinf !== null) out.push(pendingExtinf);
  return out.join('\n');
}