import Hls from 'hls.js';
import { filterAdsFromM3U8 } from './adFilter';
import { httpBytes, httpText, isTauri } from './env';

type LoaderCtor = new (config: unknown) => {
  load(context: LoaderContext, config: unknown, callbacks: LoaderCallbacks): void;
  abort?(): void;
  destroy?(): void;
};

export interface LoaderStats {
  aborted: boolean;
  loaded: number;
  total: number;
  retry: number;
  trequest: number;
  tfirst: number;
  tload: number;
  retryDelay: number;
}

export interface LoaderContext {
  url: string;
  frag?: unknown;
  keyInfo?: unknown;
  type?: string;
}

export interface LoaderCallbacks {
  onSuccess: (response: { url: string; data: string | ArrayBuffer }, stats: LoaderStats, context: LoaderContext, networkDetails: unknown) => void;
  onError: (data: { code: number; text: string }, context: LoaderContext, networkDetails: unknown, stats: LoaderStats) => void;
}

function isPlaylistContext(context: LoaderContext): boolean {
  return !context.frag && !context.keyInfo
    && (context.type === 'manifest' || context.type === 'level'
      || context.type === 'audioTrack' || context.type === 'subtitleTrack');
}

/** 用 Tauri 原生取流替换 hls.js 默认 XHR loader，绕过 WebView CORS。 */
export function createNativeHlsLoader(filterAds = false): LoaderCtor | null {
  if (!isTauri()) return null;
  const Base = Hls.DefaultConfig.loader as unknown as LoaderCtor | undefined;
  if (!Base) return null;

  return class NativeHlsLoader extends Base {
    private nativeStats: LoaderStats = {
      aborted: false,
      loaded: 0,
      total: 0,
      retry: 0,
      trequest: 0,
      tfirst: 0,
      tload: 0,
      retryDelay: 0,
    };

    load(context: LoaderContext, _config: unknown, callbacks: LoaderCallbacks) {
      const stats: LoaderStats = {
        aborted: false,
        loaded: 0,
        total: 0,
        retry: 0,
        trequest: performance.now(),
        tfirst: 0,
        tload: 0,
        retryDelay: 0,
      };
      this.nativeStats = stats;
      const playlist = isPlaylistContext(context);

      const done = (data: string | ArrayBuffer) => {
        if (stats.aborted) return;
        const payload = filterAds && playlist && typeof data === 'string'
          ? filterAdsFromM3U8(data)
          : data;
        stats.tfirst = performance.now();
        stats.tload = performance.now();
        stats.loaded = typeof payload === 'string' ? payload.length : payload.byteLength;
        stats.total = stats.loaded;
        callbacks.onSuccess({ url: context.url, data: payload }, stats, context, null);
      };
      const fail = (error: unknown) => {
        if (stats.aborted) return;
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
      this.nativeStats.aborted = true;
    }

    destroy() {
      this.nativeStats.aborted = true;
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