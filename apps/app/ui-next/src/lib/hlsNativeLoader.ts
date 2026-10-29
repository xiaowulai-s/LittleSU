import Hls from 'hls.js';
import { filterAdsFromM3U8 } from './adFilter';
import { httpBytes, httpText, isTauri } from './env';

type LoaderCtor = new (config: unknown) => {
  load(context: LoaderContext, config: unknown, callbacks: LoaderCallbacks): void;
  abort?(): void;
  destroy?(): void;
  stats?: HlsLoadStats | null;
};

/** 必须与 hls.js 内部 LoadStats 结构一致：onSuccess 之后 hls 会写 parsing / buffering 等字段。 */
export interface HlsLoadStats {
  aborted: boolean;
  loaded: number;
  total: number;
  retry: number;
  chunkCount: number;
  bwEstimate: number;
  loading: { start: number; first: number; end: number };
  parsing: { start: number; end: number };
  buffering: { start: number; first: number; end: number };
}

export interface LoaderContext {
  url: string;
  frag?: unknown;
  keyInfo?: unknown;
  type?: string;
}

export interface LoaderCallbacks {
  onSuccess: (response: { url: string; data: string | ArrayBuffer }, stats: HlsLoadStats, context: LoaderContext, networkDetails: unknown) => void;
  onError: (data: { code: number; text: string }, context: LoaderContext, networkDetails: unknown, stats: HlsLoadStats) => void;
}

function isPlaylistContext(context: LoaderContext): boolean {
  return !context.frag && !context.keyInfo
    && (context.type === 'manifest' || context.type === 'level'
      || context.type === 'audioTrack' || context.type === 'subtitleTrack'
      || context.type === 'steering-manifest');
}

function resetStats(stats: HlsLoadStats): void {
  stats.aborted = false;
  stats.loaded = 0;
  stats.total = 0;
  stats.retry = 0;
  stats.chunkCount = 0;
  stats.bwEstimate = 0;
  stats.loading.start = performance.now();
  stats.loading.first = 0;
  stats.loading.end = 0;
  stats.parsing.start = 0;
  stats.parsing.end = 0;
  stats.buffering.start = 0;
  stats.buffering.first = 0;
  stats.buffering.end = 0;
}

/** 用 Tauri 原生取流替换 hls.js 默认 XHR loader，绕过 WebView CORS。 */
export function createNativeHlsLoader(filterAds = false): LoaderCtor | null {
  if (!isTauri()) return null;
  const Base = Hls.DefaultConfig.loader as unknown as LoaderCtor | undefined;
  if (!Base) return null;

  return class NativeHlsLoader extends Base {
    load(context: LoaderContext, _config: unknown, callbacks: LoaderCallbacks) {
      const stats = this.stats;
      if (!stats) return;
      resetStats(stats);
      const playlist = isPlaylistContext(context);

      const done = (data: string | ArrayBuffer) => {
        if (stats.aborted) return;
        const payload = filterAds && playlist && typeof data === 'string'
          ? filterAdsFromM3U8(data)
          : data;
        const now = performance.now();
        stats.loading.first = now;
        stats.loading.end = now;
        stats.loaded = typeof payload === 'string' ? payload.length : payload.byteLength;
        stats.total = stats.loaded;
        callbacks.onSuccess({ url: context.url, data: payload }, stats, context, null);
      };
      const fail = (error: unknown) => {
        if (stats.aborted) return;
        stats.loading.end = performance.now();
        const text = error instanceof Error ? error.message : String(error);
        callbacks.onError({ code: 0, text }, context, null, stats);
      };

      if (playlist) {
        httpText(context.url, { timeoutSecs: 25 }).then(done).catch(fail);
      } else {
        httpBytes(context.url, { timeoutSecs: 25 }).then(done).catch(fail);
      }
    }

    abort() {
      if (this.stats) this.stats.aborted = true;
    }

    destroy() {
      if (this.stats) this.stats.aborted = true;
    }
  };
}

/** 浏览器调试时对默认 loader 的播放列表做同样的广告过滤。 */
function createBrowserFilteringLoader(filterAds: boolean): LoaderCtor | null {
  if (!filterAds) return null;
  const Base = Hls.DefaultConfig.loader as unknown as LoaderCtor | undefined;
  if (!Base) return null;

  return class BrowserFilteringLoader extends Base {
    load(context: LoaderContext, config: unknown, callbacks: LoaderCallbacks) {
      if (!isPlaylistContext(context)) {
        super.load(context, config, callbacks);
        return;
      }
      const onSuccess = callbacks.onSuccess;
      callbacks.onSuccess = (response, stats, ctx, networkDetails) => {
        if (typeof response.data === 'string') {
          response.data = filterAdsFromM3U8(response.data);
        }
        onSuccess(response, stats, ctx, networkDetails);
      };
      super.load(context, config, callbacks);
    }
  };
}

export function hlsConfigWithNativeLoader(filterAds = false): Record<string, unknown> {
  const loader = createNativeHlsLoader(filterAds) ?? createBrowserFilteringLoader(filterAds);
  return {
    enableWorker: true,
    lowLatencyMode: false,
    backBufferLength: 30,
    maxBufferLength: 30,
    manifestLoadingMaxRetry: 2,
    fragLoadingMaxRetry: 4,
    ...(loader ? { loader } : {}),
  };
}
