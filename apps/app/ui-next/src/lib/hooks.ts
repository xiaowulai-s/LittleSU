import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Episode, Title } from '../data';
import { titles as mockTitles } from '../data';
import { useApp } from '../store';
import { applyDetail, buildTitle, dedupeTitles, parseDetail, parseSearchPage } from './cms';
import { mergeVariantCandidates } from './variants';
import type { CmsItem } from './cms';
import { httpJson, httpText, isTauri, rustSearch } from './env';
import { detailUrlFor, findSource, isSourceHealthy, latestUrlFor, searchableSources } from './sources';
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

async function searchOneSource(source: SourceDef, query: string, page = 1): Promise<{ titles: Title[]; pageCount?: number }> {
  const raw = source.custom
    ? await rustSearch('custom', query, source.base, page)
    : await rustSearch(source.key, query, undefined, page);
  return parseSearchPage(raw, source, source.name);
}

export type SearchScope = 'recommended' | 'all' | 'ok';

export interface SearchState {
  loading: boolean;
  loadingMore: boolean;
  results: Title[];
  failures: { name: string; reason: string }[];
  real: boolean;
  total: number;
  hasMore: boolean;
  loadMore: () => void;
}

export function useSearch(query: string, scope: SearchScope = 'recommended', limit?: number): SearchState {
  const { activeSources, health, customApis } = useApp();

  const targets = useMemo<SourceDef[]>(() => {
    let list: SourceDef[];
    if (scope === 'all') list = searchableSources(customApis);
    else if (scope === 'ok') list = searchableSources(customApis).filter((source) => isSourceHealthy(source, health));
    else list = activeSources;
    return limit && limit > 0 ? list.slice(0, limit) : list;
  }, [scope, activeSources, health, customApis, limit]);

  const [state, setState] = useState<SearchState>({
    loading: false,
    loadingMore: false,
    results: [],
    failures: [],
    real: false,
    total: 0,
    hasMore: false,
    loadMore: () => undefined,
  });
  const textRef = useRef('');
  const targetsRef = useRef<SourceDef[]>(targets);
  const limitRef = useRef<number | undefined>(limit);
  const runRef = useRef(0);
  const pageRef = useRef(1);
  const resultsRef = useRef<Title[]>([]);
  const failuresRef = useRef<{ name: string; reason: string }[]>([]);
  const busyRef = useRef(false);

  const loadPage = useCallback(async (page: number, append: boolean) => {
    const text = textRef.current;
    const sources = targetsRef.current;
    if (!text || !sources.length) return;
    const runId = runRef.current;
    busyRef.current = true;
    if (append) setState((prev) => ({ ...prev, loadingMore: true }));
    const existing = new Set(resultsRef.current.map((title) => title.key ?? title.id));
    let added = 0;
    let maxPageCount = 0;
    let index = 0;

    const worker = async () => {
      while (true) {
        const cursor = index;
        index += 1;
        if (cursor >= sources.length || runId !== runRef.current) return;
        const source = sources[cursor];
        try {
          const { titles, pageCount } = await withTimeout(searchOneSource(source, text, page), 12000);
          if (runId !== runRef.current) return;
          if (pageCount) maxPageCount = Math.max(maxPageCount, pageCount);
          if (!titles.length) continue;
          const fresh: Title[] = [];
          titles.forEach((title) => {
            const key = title.key ?? title.id;
            if (existing.has(key)) return;
            existing.add(key);
            fresh.push(title);
          });
          if (!fresh.length) continue;
          added += fresh.length;
          resultsRef.current = dedupeTitles([...resultsRef.current, ...fresh]).slice(0, 500);
          setState((prev) => ({ ...prev, results: resultsRef.current }));
        } catch (error: unknown) {
          if (runId !== runRef.current) return;
          failuresRef.current = [
            ...failuresRef.current,
            { name: source.name, reason: error instanceof Error ? error.message : '请求失败' },
          ];
          setState((prev) => ({ ...prev, failures: failuresRef.current }));
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(6, sources.length) }, worker));
    if (runId !== runRef.current) return;
    busyRef.current = false;
    const hasMore = !limitRef.current && page < 20 && added > 0 && (maxPageCount ? page < maxPageCount : true);
    setState((prev) => ({ ...prev, loading: false, loadingMore: false, hasMore }));
  }, []);

  useEffect(() => {
    const text = query.trim();
    textRef.current = text;
    targetsRef.current = targets;
    limitRef.current = limit;
    runRef.current += 1;
    pageRef.current = 1;
    resultsRef.current = [];
    failuresRef.current = [];
    busyRef.current = false;

    if (!text) {
      setState({ loading: false, loadingMore: false, results: [], failures: [], real: false, total: targets.length, hasMore: false, loadMore: () => undefined });
      return;
    }
    if (!isTauri() || !targets.length) {
      const lower = text.toLowerCase();
      const results = mockTitles.filter((title) =>
        [title.name, title.en, title.type, ...title.genres].some((value) =>
          (value || '').toLowerCase().includes(lower),
        ),
      );
      setState({ loading: false, loadingMore: false, results, failures: [], real: false, total: targets.length, hasMore: false, loadMore: () => undefined });
      return;
    }

    setState({ loading: true, loadingMore: false, results: [], failures: [], real: true, total: targets.length, hasMore: false, loadMore: () => undefined });
    void loadPage(1, false);
    return () => {
      runRef.current += 1;
    };
  }, [query, targets, limit, loadPage]);

  const loadMore = useCallback(() => {
    if (busyRef.current || state.loading || state.loadingMore || !state.hasMore) return;
    pageRef.current += 1;
    void loadPage(pageRef.current, true);
  }, [state.loading, state.loadingMore, state.hasMore, loadPage]);

  return { ...state, loadMore };
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
  const { customApis, activeSources } = useApp();
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

    /** 收藏/历史进入时没有 variants，按片名在前几个已启用源回查，恢复详情页换源。 */
    const enrichVariants = async (detail: Title): Promise<Title> => {
      if (detail.variants?.length || !detail.sourceKey || !detail.vodId || !detail.name) return detail;
      const sources = activeSources
        .filter((item) => item.key !== detail.sourceKey && item.status !== 'experimental')
        .slice(0, 4);
      if (!sources.length) return detail;
      const found = await Promise.all(sources.map(async (item) => {
        try {
          const { titles } = await withTimeout(searchOneSource(item, detail.name), 9000);
          return titles.map((result) => ({ title: result, sourceKey: item.key, sourceName: item.name }));
        } catch {
          return [];
        }
      }));
      return mergeVariantCandidates(detail, found.flat());
    };

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
        return enrichVariants(primary);
      }
      const html = await withTimeout(httpText(detailUrlFor(source, base.vodId as string)), 15000);
      const episodes = parseHtmlEpisodes(html);
      if (!episodes.length) throw new Error('未获取到剧集信息');
      return enrichVariants({ ...base, episodesList: episodes, playUrl: episodes[0].url, episodes: episodes.length });
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
  }, [key, title, customApis, activeSources]);

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