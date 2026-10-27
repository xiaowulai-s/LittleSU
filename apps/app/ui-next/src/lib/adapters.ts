import type { Title } from '../data';
import type { FavoriteRecord, HistoryRecord } from './storage';

export function hashHue(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 360;
  return hash;
}

export function historyToTitle(record: HistoryRecord): Title {
  return {
    id: record.key,
    key: record.key,
    name: record.name,
    year: 0,
    rating: 0,
    type: '剧集',
    region: '',
    genres: [],
    synopsis: '',
    episodes: 1,
    duration: '',
    hue: hashHue(record.name),
    source: record.sourceName || '历史记录',
    quality: 'HD',
    poster: record.poster,
    sourceKey: record.sourceKey,
    vodId: record.vodId,
    playUrl: record.playUrl,
  };
}

export function favoriteToTitle(record: FavoriteRecord): Title {
  return {
    id: record.key,
    key: record.key,
    name: record.name,
    poster: record.poster,
    year: record.year,
    rating: record.rating,
    type: record.type,
    genres: record.genres,
    region: '',
    synopsis: '',
    episodes: 1,
    duration: '',
    hue: hashHue(record.name),
    source: record.source,
    quality: record.quality,
    sourceKey: record.sourceKey,
    vodId: record.vodId,
  };
}