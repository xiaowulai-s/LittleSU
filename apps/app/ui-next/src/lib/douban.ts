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
const detailCache = new Map<string, { at: number; value: DoubanDetail }>();

export function clearDoubanCache(): void {
  cache.clear();
  detailCache.clear();
}

export interface DoubanDetail {
  id: string;
  title: string;
  searchTitle?: string;
  originalTitle?: string;
  year?: string;
  rating: string;
  cover: string;
  intro?: string;
  genres: string[];
  directors: string[];
  actors: string[];
  countries: string[];
  duration?: string;
  episodes?: string;
  shortComment?: string;
  isTv: boolean;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string') {
        return ((item as { name: string }).name).trim();
      }
      return '';
    })
    .filter(Boolean);
}

/** 解析豆瓣 rexxar 详情接口。 */
export function parseDoubanRexxar(data: Record<string, unknown>, isTv: boolean): DoubanDetail | null {
  const id = String(data.id ?? '').trim();
  const title = String(data.title ?? '').trim();
  if (!id || !title) return null;
  const pic = data.pic && typeof data.pic === 'object' ? data.pic as Record<string, unknown> : {};
  const rating = data.rating && typeof data.rating === 'object' ? data.rating as Record<string, unknown> : {};
  const durations = strings(data.durations);
  const episodes = Number(data.episodes_count) || Number(data.webisode_count) || 0;
  return {
    id,
    title,
    searchTitle: title,
    originalTitle: typeof data.original_title === 'string' ? data.original_title.trim() : undefined,
    year: data.year ? String(data.year) : undefined,
    rating: rating.value !== undefined && rating.value !== null ? String(rating.value) : '',
    cover: String(pic.large ?? data.cover_url ?? data.cover ?? '').trim(),
    intro: typeof data.intro === 'string' ? data.intro.trim() : undefined,
    genres: strings(data.genres),
    directors: strings(data.directors),
    actors: strings(data.actors),
    countries: strings(data.countries),
    duration: durations.join(' / ') || undefined,
    episodes: episodes > 0 ? `${episodes} 集` : undefined,
    isTv,
  };
}

/** 解析 movie.douban.com 的 subject_abstract 兜底接口。 */
export function parseDoubanAbstract(data: Record<string, unknown>, isTv: boolean): DoubanDetail | null {
  const subject = data.subject && typeof data.subject === 'object' ? data.subject as Record<string, unknown> : null;
  if (!subject) return null;
  const id = String(subject.id ?? '').trim();
  const rawTitle = String(subject.title ?? '').trim();
  if (!id || !rawTitle) return null;
  const shortComment = subject.short_comment && typeof subject.short_comment === 'object'
    ? subject.short_comment as Record<string, unknown>
    : {};
  const chineseTitle = rawTitle.match(/^[\u4e00-\u9fa5·：:！？、0-9]+/)?.[0];
  return {
    id,
    title: rawTitle,
    searchTitle: chineseTitle || rawTitle.replace(/\s*\(\d{4}\)\s*$/, ''),
    year: subject.release_year ? String(subject.release_year) : undefined,
    rating: subject.rate ? String(subject.rate) : '',
    cover: '',
    genres: strings(subject.types),
    directors: strings(subject.directors),
    actors: strings(subject.actors),
    countries: subject.region ? [String(subject.region)] : [],
    duration: subject.duration ? String(subject.duration) : undefined,
    shortComment: typeof shortComment.content === 'string' ? shortComment.content.trim() : undefined,
    isTv: subject.is_tv === true || isTv,
  };
}

export async function fetchDoubanDetail(id: string, isTv = false): Promise<DoubanDetail> {
  if (!isTauri()) throw new Error('豆瓣详情需要在客户端内加载');
  const cacheKey = `${isTv ? 'tv' : 'movie'}:${id}`;
  const hit = detailCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value;

  const mobileHeaders = {
    'User-Agent': DESKTOP_UA,
    Referer: 'https://m.douban.com/',
    Accept: 'application/json',
  };
  try {
    const data = await httpJson(`https://m.douban.com/rexxar/api/v2/${isTv ? 'tv' : 'movie'}/${id}`, {
      timeoutSecs: 15,
      headers: mobileHeaders,
    });
    const detail = parseDoubanRexxar(data as Record<string, unknown>, isTv);
    if (detail) {
      detailCache.set(cacheKey, { at: Date.now(), value: detail });
      return detail;
    }
  } catch {
    /* 回退到 subject_abstract */
  }

  const data = await httpJson(`https://movie.douban.com/j/subject_abstract?subject_id=${encodeURIComponent(id)}`, {
    timeoutSecs: 15,
    headers: {
      'User-Agent': DESKTOP_UA,
      Referer: 'https://movie.douban.com/',
      Accept: 'application/json',
    },
  });
  const detail = parseDoubanAbstract(data as Record<string, unknown>, isTv);
  if (!detail) throw new Error('豆瓣详情为空');
  detailCache.set(cacheKey, { at: Date.now(), value: detail });
  return detail;
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
