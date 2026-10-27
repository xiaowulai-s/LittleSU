import { useEffect, useMemo, useState } from 'react';
import type { Episode, Title } from '../data';
import { titles as mockTitles } from '../data';
import { useApp } from '../store';
import { applyDetail, buildTitle, dedupeTitles, parseDetail, parseSearchResponse } from './cms';
import type { CmsItem } from './cms';
import { httpJson, httpText, isTauri, rustSearch } from './env';
import { SOURCES, customDefs, detailUrlFor, findSource, isSourceHealthy, latestUrlFor } from './sources';
import type { SourceDef } from './sources';
import { parsePlaylist } from './liveParser';
import type { LiveChannel } from './liveParser';
import { fetchEpg } from './epg';
import type { EpgResult } from './epg';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('请求超时')), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function searchOneSource(source: SourceDef, query: string): Promise<Title[]> {
  const raw = source.custom
    ? await rustSearch('custom', query, source.base)
    : await rustSearch(source.key, query);
  return parseSearchResponse(raw, source, source.name);
}

export type SearchScope = 'recommended' | 'all' | 'ok';

export interface SearchState {
  loading: boolean;
  results: Title[];
  failures: { name: string; reason: string }[];
  real: boolean;
  total: number;
}

export function useSearch(query: string, scope: SearchScope = 'recommended'): SearchState {
  const { activeSources, health, customApis } = useApp();

  const targets = useMemo<SourceDef[]>(() => {
    if (scope === 'all') return [...SOURCES, ...customDefs(customApis)];
    if (scope === 'ok') {
      return [...SOURCES, ...customDefs(customApis)].filter((source) => isSourceHealthy(source, health));
    }
    return activeSources;
  }, [scope, activeSources, health, customApis]);

  const [state, setState] = useState<SearchState>({ loading: false, results: [], failures: [], real: false, total: 0 });

  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setState({ loading: false, results: [], failures: [], real: false, total: targets.length });
      return;
    }
    if (!isTauri() || !targets.length) {
      const lower = text.toLowerCase();
      const results = mockTitles.filter((title) =>
        [title.name, title.en, title.type, ...title.genres].some((value) =>
          (value || '').toLowerCase().includes(lower),
        ),
      );
      setState({ loading: false, results, failures: [], real: false, total: targets.length });
      return;
    }

    let cancelled = false;
    const collected: Title[] = [];
    const failures: { name: string; reason: string }[] = [];
    const sources = targets;
    let index = 0;
    setState({ loading: true, results: [], failures: [], real: true, total: sources.length });

    const worker = async () => {
      while (!cancelled) {
        const cursor = index;
        index += 1;
        if (cursor >= sources.length) return;
        const source = sources[cursor];
        try {
          const list = await withTimeout(searchOneSource(source, text), 12000);
          if (cancelled || !list.length) continue;
          collected.push(...list);
          setState((prev) => ({ ...prev, results: dedupeTitles([...collected]).slice(0, 200) }));
        } catch (error: unknown) {
          if (cancelled) return;
          failures.push({
            name: source.name,
            reason: error instanceof Error ? error.message : '请求失败',
          });
          setState((prev) => ({ ...prev, failures: [...failures] }));
        }
      }
    };

    Promise.all(Array.from({ length: Math.min(6, sources.length) }, worker)).then(() => {
      if (!cancelled) setState((prev) => ({ ...prev, loading: false }));
    });

    return () => {
      cancelled = true;
    };
  }, [query, targets]);

  return state;
}

function parseHtmlEpisodes(html: string): Episode[] {
  const matches = html.match(/\$(https?:\/\/[^"'\s]+?\.m3u8)/g) || [];
  const urls = matches.map((match) => match.slice(1));
  const unique = Array.from(new Set(urls));
  return unique.map((url, index) => ({ name: `第 ${index + 1} 集`, url }));
}

async function fetchDetail(base: Title, source: SourceDef): Promise<Title | null> {
  const url = detailUrlFor(source, base.vodId as string);
  try {
    const json = await withTimeout(httpJson(url), 15000);
    const item = parseDetail(json) as CmsItem | null;
    if (item) return applyDetail(base, item);
  } catch {
    /* HTML 兜底由调用方处理 */
  }
  return null;
}

export interface DetailState {
  title?: Title;
  loading: boolean;
  error?: string;
}

export function useDetail(title: Title | undefined): DetailState {
  const { customApis } = useApp();
  const [state, setState] = useState<DetailState>({ title, loading: false });

  const key = title?.key ?? title?.id;

  useEffect(() => {
    if (!title) {
      setState({ title: undefined, loading: false });
      return;
    }
    if (!isTauri() || !title.sourceKey || !title.vodId) {
      setState({ title, loading: false });
      return;
    }
    const source = findSource(title.sourceKey, customApis);
    if (!source) {
      setState({ title, loading: false });
      return;
    }
    if (title.episodesList?.length) {
      setState({ title, loading: false });
      return;
    }

    let cancelled = false;
    setState({ title, loading: true });

    (async () => {
      const base = title as Title;
      const primary = await fetchDetail(base, source).catch(() => null);
      if (primary?.episodesList?.length) {
        const hasDirect = primary.episodesList.some((episode) => /\.m3u8/i.test(episode.url));
        if (!hasDirect && base.variants?.length) {
          for (const variant of base.variants.slice(0, 4)) {
            if (variant.sourceKey === source.key && variant.vodId === base.vodId) continue;
            const variantSource = findSource(variant.sourceKey, customApis);
            if (!variantSource) continue;
            const variantBase: Title = {
              ...base,
              key: `${variantSource.key}:${variant.vodId}`,
              id: `${variantSource.key}:${variant.vodId}`,
              source: variantSource.name,
              sourceKey: variantSource.key,
              vodId: variant.vodId,
            };
            const detail = await fetchDetail(variantBase, variantSource).catch(() => null);
            if (detail?.episodesList?.some((episode) => /\.m3u8/i.test(episode.url))) {
              return {
                ...detail,
                sources: Array.from(new Set([...(base.sources || []), variantSource.name])),
              };
            }
          }
        }
        return primary;
      }
      const html = await withTimeout(httpText(detailUrlFor(source, base.vodId as string)), 15000);
      const episodes = parseHtmlEpisodes(html);
      if (!episodes.length) throw new Error('未获取到剧集信息');
      return { ...base, episodesList: episodes, playUrl: episodes[0].url, episodes: episodes.length };
    })()
      .then((merged) => {
        if (!cancelled) setState({ title: merged, loading: false });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            title,
            loading: false,
            error: error instanceof Error ? error.message : '详情获取失败',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [key, title, customApis]);

  return state;
}

export interface FeedState {
  loading: boolean;
  items: Title[];
  real: boolean;
}

function parseLatest(json: unknown, source: SourceDef): Title[] {
  const data = json as { list?: CmsItem[]; data?: CmsItem[]; result?: CmsItem[] } | null;
  const list = data?.list || data?.data || data?.result;
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => buildTitle(item, source, source.name))
    .filter((title): title is Title => Boolean(title));
}

export function useHomeFeed(): FeedState {
  const { activeSources } = useApp();
  const [state, setState] = useState<FeedState>({ loading: false, items: mockTitles, real: false });

  useEffect(() => {
    if (!isTauri() || !activeSources.length) {
      setState({ loading: false, items: mockTitles, real: false });
      return;
    }
    const picks = activeSources.filter((source) => source.status === 'ok').slice(0, 2);
    if (!picks.length) {
      setState({ loading: false, items: mockTitles, real: false });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    Promise.all(
      picks.map(async (source) => {
        const json = await withTimeout(httpJson(latestUrlFor(source)), 15000);
        return parseLatest(json, source);
      }),
    )
      .then((lists) => {
        if (cancelled) return;
        const merged = dedupeTitles(lists.flat()).filter((title) => title.name);
        setState({ loading: false, items: merged.length >= 6 ? merged : mockTitles, real: merged.length >= 6 });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, items: mockTitles, real: false });
      });

    return () => {
      cancelled = true;
    };
  }, [activeSources]);

  return state;
}

export interface LiveState {
  loading: boolean;
  channels: LiveChannel[];
  error?: string;
}

export function useLivePlaylist(url: string, token = 0): LiveState {
  const [state, setState] = useState<LiveState>({ loading: true, channels: [] });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, channels: [] });
    withTimeout(httpText(url, { timeoutSecs: 25 }), 30000)
      .then((text) => {
        if (cancelled) return;
        setState({ loading: false, channels: parsePlaylist(text) });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          loading: false,
          channels: [],
          error: error instanceof Error ? error.message : '频道列表加载失败',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [url, token]);

  return state;
}

export function useRelatedTitles(items: Title[], currentKey?: string): Title[] {
  return useMemo(() => items.filter((title) => (title.key ?? title.id) !== currentKey).slice(0, 6), [items, currentKey]);
}

export interface EpgState {
  loading: boolean;
  data: EpgResult | null;
  error?: string;
}

/** 按频道拉取当天/次日节目单；仅在客户端内可用（浏览器内会被 CORS/混合内容拦截）。 */
export function useEpg(channel: LiveChannel | undefined, date: string): EpgState {
  const [state, setState] = useState<EpgState>({ loading: false, data: null });

  useEffect(() => {
    if (!channel) {
      setState({ loading: false, data: null });
      return;
    }
    let cancelled = false;
    setState({ loading: true, data: null });
    fetchEpg(channel, date)
      .then((data) => {
        if (!cancelled) setState({ loading: false, data });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            loading: false,
            data: null,
            error: error instanceof Error ? error.message : '节目单加载失败',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [channel?.id, channel?.name, channel?.tvgId, date]);

  return state;
}