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

export type DoubanType = 'movie' | 'tv';
export type DoubanSort = 'recommend' | 'time' | 'rank';
export type DoubanTabKey =
  | 'hot-movie'
  | 'high-movie'
  | 'top-movie'
  | 'latest-movie'
  | 'hot-tv'
  | 'high-tv'
  | 'latest-tv';

export interface DoubanTabDef {
  key: DoubanTabKey;
  label: string;
  type: DoubanType;
  tag: string;
  sort: DoubanSort;
}

export const DOUBAN_TABS: DoubanTabDef[] = [
  { key: 'hot-movie', label: '热门电影', type: 'movie', tag: '热门', sort: 'recommend' },
  { key: 'high-movie', label: '高分电影', type: 'movie', tag: '豆瓣高分', sort: 'recommend' },
  { key: 'top-movie', label: 'Top250', type: 'movie', tag: '豆瓣电影Top250', sort: 'rank' },
  { key: 'latest-movie', label: '最新电影', type: 'movie', tag: '最新', sort: 'time' },
  { key: 'hot-tv', label: '热门剧集', type: 'tv', tag: '热门', sort: 'recommend' },
  { key: 'high-tv', label: '高分剧集', type: 'tv', tag: '豆瓣高分', sort: 'recommend' },
  { key: 'latest-tv', label: '最新剧集', type: 'tv', tag: '最新', sort: 'time' },
];

export const DOUBAN_CATEGORIES: Record<DoubanType, string[]> = {
  movie: ['全部', '剧情', '喜剧', '动作', '爱情', '科幻', '悬疑', '犯罪', '动画', '纪录片'],
  tv: ['全部', '国产剧', '美剧', '英剧', '韩剧', '日剧', '综艺'],
};

export interface DoubanItem {
  id: string;
  title: string;
  cover: string;
  rate: string;
  isTv: boolean;
}

const cache = new Map<string, { at: number; items: DoubanItem[] }>();

export function clearDoubanCache(): void {
  cache.clear();
}

export interface DoubanQuery {
  type: DoubanType;
  tag: string;
  sort: DoubanSort;
}

/** 分类优先于榜单标签；分类固定按推荐排序。 */
export function resolveDoubanQuery(tabKey: DoubanTabKey, category = '全部'): DoubanQuery | null {
  const config = DOUBAN_TABS.find((item) => item.key === tabKey);
  if (!config) return null;
  const useCategory = category && category !== '全部';
  return {
    type: config.type,
    tag: useCategory ? category : config.tag,
    sort: useCategory ? 'recommend' : config.sort,
  };
}

export async function fetchDouban(tabKey: DoubanTabKey, category = '全部', limit = 18): Promise<DoubanItem[]> {
  const config = DOUBAN_TABS.find((item) => item.key === tabKey);
  const query = resolveDoubanQuery(tabKey, category);
  if (!config || !query) throw new Error('未知的豆瓣榜单');
  if (!isTauri()) throw new Error('豆瓣推荐需要在客户端内加载');

  const { tag, sort } = query;
  const cacheKey = `${config.type}|${tag}|${sort}|${limit}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.items;

  const url = `${API}?type=${config.type}&tag=${encodeURIComponent(tag)}&sort=${sort}&page_limit=${limit}&page_start=0`;
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
