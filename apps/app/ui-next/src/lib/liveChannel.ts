import type { LiveChannel } from './liveParser';

/** 去掉清晰度、空格和常见后缀，得到跨源匹配用的频道键。 */
export function normalizeChannelName(name: string): string {
  const text = (name || '')
    .toLowerCase()
    // 去掉 [Geo-blocked]、[Not 24/7] 等标注和 (720p) 分辨率
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\d{3,4}p/g, '')
    .replace(/[\s\-_·:：/\\()[\]【】（）]/g, '')
    .replace(/(超高清|高清|超清|蓝光|标清|超高畫質|藍光|標清|4k|8k|uhd|fhd|hd|sd)+$/g, '')
    .replace(/(综合|频道|綜合|頻道)$/g, '');
  return text.trim();
}

export function channelKey(channel: Pick<LiveChannel, 'name' | 'tvgId'>): string {
  const name = normalizeChannelName(channel.name);
  if (name) return name;
  return (channel.tvgId || '').toLowerCase().trim();
}

/** 同名（去掉清晰度/通用后缀）或相同 tvg-id 视为同一频道。 */
export function sameChannel(
  a: Pick<LiveChannel, 'name' | 'tvgId'>,
  b: Pick<LiveChannel, 'name' | 'tvgId'>,
): boolean {
  const idA = (a.tvgId || '').toLowerCase().trim();
  const idB = (b.tvgId || '').toLowerCase().trim();
  if (idA && idB && idA === idB) return true;
  const keyA = channelKey(a);
  const keyB = channelKey(b);
  return Boolean(keyA && keyB && keyA === keyB);
}

export function findChannelMatch<T extends Pick<LiveChannel, 'name' | 'tvgId'>>(
  list: T[],
  target: Pick<LiveChannel, 'name' | 'tvgId'>,
): T | undefined {
  const exact = list.find((channel) => sameChannel(channel, target));
  if (exact) return exact;
  const key = channelKey(target);
  if (!key) return undefined;
  return list.find((channel) => channelKey(channel) === key);
}
