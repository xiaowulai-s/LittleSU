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

/** 用 Tauri 原生取流替换 hls.js 默认 XHR loader，绕过 WebView CORS。 */
export function createNativeHlsLoader(): LoaderCtor | null {
  if (!isTauri()) return null;
  const globalHls = (window as unknown as { Hls?: { DefaultConfig?: { loader?: LoaderCtor } } }).Hls;
  const Base = globalHls?.DefaultConfig?.loader;
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
      const isPlaylist = !context.frag && !context.keyInfo
        && (context.type === 'manifest' || context.type === 'level'
          || context.type === 'audioTrack' || context.type === 'subtitleTrack');

      const done = (data: string | ArrayBuffer) => {
        if (stats.aborted) return;
        stats.tfirst = performance.now();
        stats.tload = performance.now();
        stats.loaded = typeof data === 'string' ? data.length : data.byteLength;
        stats.total = stats.loaded;
        callbacks.onSuccess({ url: context.url, data }, stats, context, null);
      };
      const fail = (error: unknown) => {
        if (stats.aborted) return;
        const text = error instanceof Error ? error.message : String(error);
        callbacks.onError({ code: 0, text }, context, null, stats);
      };

      if (isPlaylist) {
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

export function hlsConfigWithNativeLoader(): Record<string, unknown> {
  const loader = createNativeHlsLoader();
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