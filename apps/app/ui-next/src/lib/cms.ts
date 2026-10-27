import type { Episode, Title, TitleType } from '../data';
import type { SourceDef } from './sources';

export interface CmsItem {
  [key: string]: unknown;
}

function str(item: CmsItem, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return undefined;
}

export function stripHtml(text: string | undefined): string {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/s+/g, ' ')
    .trim();
}

export function qualityFrom(remarks?: string): string {
  const text = (remarks || '').toUpperCase();
  if (text.includes('4K') || text.includes('2160')) return '4K';
  if (text.includes('1080')) return '1080P';
  if (text.includes('720')) return '720P';
  return 'HD';
}

function typeFrom(typeName?: string): TitleType {
  const text = typeName || '';
  if (/纪录|记录/.test(text)) return '纪录片';
  if (/动漫|动画/.test(text)) return '动画';
  if (/综艺|真人秀/.test(text)) return '综艺';
  if (/剧|电视/.test(text)) return '剧集';
  return '电影';
}

function hueFrom(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 360;
  return hash;
}

export function normalizeTitleText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s·:：\-—_.。!！?？,，、/\\()[\]【】《》"'“”]/g, '')
    .replace(/第[一二三四五六七八九十\d]+季/g, '');
}

function playableScore(playRaw?: string): number {
  if (!playRaw) return 0;
  if (/\.m3u8/i.test(playRaw)) return 3;
  if (/\/share\//i.test(playRaw)) return 1;
  return 2;
}

export function buildTitle(item: CmsItem, source: SourceDef, sourceName: string): Title | null {
  const vodId = str(item, ['vod_id', 'id']);
  const name = str(item, ['vod_name', 'name', 'title']);
  if (!vodId || !name) return null;
  const remarks = str(item, ['vod_remarks', 'remarks']);
  const typeName = str(item, ['type_name', 'type']);
  const yearRaw = str(item, ['vod_year', 'year']);
  const ratingRaw = str(item, ['vod_score', 'score', 'vod_douban_score']);
  const poster = str(item, ['vod_pic', 'pic', 'vod_pic_slide']);
  const year = Number(yearRaw) || 0;
  const rating = Number(ratingRaw) || 0;
  const key = `${source.key}:${vodId}`;
  const playable = playableScore(str(item, ['vod_play_url', 'play_url']));
  return {
    id: key,
    key,
    name,
    year: year || new Date().getFullYear(),
    rating,
    type: typeFrom(typeName),
    region: str(item, ['vod_area', 'vod_region', 'area']) || '未知',
    genres: (typeName || '').split(/[,/、]/).filter(Boolean).slice(0, 3),
    synopsis: stripHtml(str(item, ['vod_content', 'vod_blurb', 'content', 'des'])) || '暂无简介',
    episodes: 1,
    duration: '',
    hue: hueFrom(name),
    source: sourceName,
    quality: qualityFrom(remarks),
    poster,
    sourceKey: source.key,
    vodId,
    sources: [sourceName],
    playable,
    variants: [{ sourceKey: source.key, sourceName, vodId, playable }],
  };
}

export function dedupeTitles(list: Title[]): Title[] {
  const map = new Map<string, Title>();
  for (const title of list) {
    const key = `${normalizeTitleText(title.name)}|${title.year || ''}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, title);
      continue;
    }
    const sources = new Set([...(existing.sources || []), ...(title.sources || [])]);
    const variantMap = new Map<string, { sourceKey: string; sourceName: string; vodId: string; playable: number }>();
    [...(existing.variants || []), ...(title.variants || [])].forEach((variant) => {
      variantMap.set(`${variant.sourceKey}:${variant.vodId}`, variant);
    });
    const variants = Array.from(variantMap.values()).sort((a, b) => b.playable - a.playable);
    const preferIncoming = (title.playable || 0) > (existing.playable || 0);
    const primary = preferIncoming ? title : existing;
    existing.id = primary.id;
    existing.key = primary.key;
    existing.source = primary.source;
    existing.sourceKey = primary.sourceKey;
    existing.vodId = primary.vodId;
    existing.playable = primary.playable;
    existing.sources = Array.from(sources);
    existing.variants = variants;
    if (!existing.poster && primary.poster) existing.poster = primary.poster;
    if ((!existing.rating || existing.rating === 0) && primary.rating) existing.rating = primary.rating;
  }
  return Array.from(map.values());
}

interface PlayEntry {
  name: string;
  url: string;
}

function splitPlayUrl(raw: string): PlayEntry[] {
  const groups = raw.split('$$$');
  const entries: PlayEntry[] = [];
  for (const group of groups) {
    const parts = group.split('#');
    for (const part of parts) {
      const sep = part.indexOf('$');
      if (sep < 0) continue;
      const name = part.slice(0, sep).trim();
      const url = part.slice(sep + 1).trim();
      if (/^https?:\/\//i.test(url)) entries.push({ name: name || '正片', url });
    }
  }
  if (entries.length) return entries;
  const matches = raw.match(/https?:\/\/[^\s#$]+/g) || [];
  return matches.map((url, index) => ({ name: `第 ${index + 1} 集`, url }));
}

export function parsePlayUrl(raw: string | undefined): Episode[] {
  if (!raw) return [];
  const seen = new Set<string>();
  return splitPlayUrl(raw)
    .filter((entry) => {
      if (seen.has(entry.url)) return false;
      seen.add(entry.url);
      return true;
    })
    .map((entry) => ({ name: entry.name, url: entry.url }));
}

export function parseDetail(json: unknown): CmsItem | null {
  const data = json as { list?: CmsItem[]; data?: CmsItem[]; result?: CmsItem[] } | null;
  const list = data?.list || data?.data || data?.result;
  if (!Array.isArray(list) || !list.length) return null;
  return list[0];
}

export function applyDetail(title: Title, item: CmsItem): Title {
  const episodes = parsePlayUrl(str(item, ['vod_play_url', 'play_url', 'vod_url']));
  const content = str(item, ['vod_content', 'vod_blurb', 'content']);
  const poster = str(item, ['vod_pic', 'pic']);
  const actor = str(item, ['vod_actor', 'actor']);
  const director = str(item, ['vod_director', 'director']);
  const remarks = str(item, ['vod_remarks', 'remarks']);
  const year = Number(str(item, ['vod_year', 'year'])) || title.year;
  const rating = Number(str(item, ['vod_score', 'score', 'vod_douban_score'])) || title.rating;
  const region = str(item, ['vod_area', 'vod_region', 'area']) || title.region;
  const typeName = str(item, ['type_name', 'type']);
  return {
    ...title,
    year,
    rating,
    region,
    poster: poster || title.poster,
    quality: qualityFrom(remarks) || title.quality,
    synopsis: stripHtml(content) || title.synopsis,
    episodes: episodes.length || title.episodes,
    episodesList: episodes,
    playUrl: episodes[0]?.url,
    genres: typeName ? typeName.split(/[,/、]/).filter(Boolean).slice(0, 3) : title.genres,
    note: actor ? `主演：${actor}` : director ? `导演：${director}` : title.note,
  };
}

export function parseSearchResponse(raw: string, source: SourceDef, sourceName: string): Title[] {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }
  const data = json as { list?: CmsItem[]; data?: CmsItem[]; result?: CmsItem[] } | null;
  const list = data?.list || data?.data || data?.result;
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => buildTitle(item, source, sourceName))
    .filter((title): title is Title => Boolean(title));
}