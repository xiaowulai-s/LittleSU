import { httpJson, isTauri } from './env';

/**
 * 豆瓣推荐榜单。
 * 客户端直接请求豆瓣的公开 j/search_subjects 接口（带 Referer/UA），
 * 结果仅用于“发现片名”，点击后回到已启用采集源里搜索可播放的地址。
 */

const API = 'https://movie.douban.com/j/search_subjects';
const CACHE_TTL = 10 * 60 * 1000;
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export type DoubanTag = 'hot-movie' | 'high-movie' | 'hot-tv' | 'high-tv';

export interface DoubanTagDef {
  key: DoubanTag;
  label: string;
  type: 'movie' | 'tv';
  tag: string;
}

export const DOUBAN_TAGS: DoubanTagDef[] = [
  { key: 'hot-movie', label: '热门电影', type: 'movie', tag: '热门' },
  { key: 'high-movie', label: '高分电影', type: 'movie', tag: '豆瓣高分' },
  { key: 'hot-tv', label: '热门剧集', type: 'tv', tag: '热门' },
  { key: 'high-tv', label: '高分剧集', type: 'tv', tag: '豆瓣高分' },
];

export interface DoubanItem {
  id: string;
  title: string;
  cover: string;
  rate: string;
  isTv: boolean;
}

const cache = new Map<string, { at: number; items: DoubanItem[] }>();

export async function fetchDouban(tagKey: DoubanTag, limit = 18): Promise<DoubanItem[]> {
  const config = DOUBAN_TAGS.find((item) => item.key === tagKey);
  if (!config) throw new Error('未知的豆瓣榜单');
  if (!isTauri()) throw new Error('豆瓣推荐需要在客户端内加载');

  const cacheKey = `${tagKey}|${limit}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.items;

  const url = `${API}?type=${config.type}&tag=${encodeURIComponent(config.tag)}&sort=recommend&page_limit=${limit}&page_start=0`;
  const data = (await httpJson(url, {
    timeoutSecs: 12,
    headers: {
      'User-Agent': DESKTOP_UA,
      Referer: 'https://movie.douban.com/',
      Accept: 'application/json',
    },
  })) as { subjects?: { id?: string; title?: string; cover?: string; rate?: string }[] };

  const items = (data.subjects ?? [])
    .map((subject) => ({
      id: String(subject.id ?? ''),
      title: (subject.title ?? '').trim(),
      cover: subject.cover ?? '',
      rate: subject.rate && subject.rate !== '0' ? subject.rate : '',
      isTv: config.type === 'tv',
    }))
    .filter((item) => item.id && item.title);

  cache.set(cacheKey, { at: Date.now(), items });
  return items;
}
