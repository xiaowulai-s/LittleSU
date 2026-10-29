/* Tauri 环境与 HTTP 访问层：Tauri 内走原生命令，浏览器内退回 fetch。 */

type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

interface TauriInternals {
  invoke?: InvokeFn;
}

interface TauriGlobal {
  __TAURI_INTERNALS__?: TauriInternals;
  __TAURI__?: { core?: { invoke?: InvokeFn } };
}

function tauriWindow(): TauriGlobal | null {
  return typeof window === 'undefined' ? null : (window as unknown as TauriGlobal);
}

export function isTauri(): boolean {
  const w = tauriWindow();
  if (!w) return false;
  return !!(w.__TAURI_INTERNALS__?.invoke || w.__TAURI__?.core?.invoke);
}

export function getInvoke(): InvokeFn | null {
  const w = tauriWindow();
  if (!w) return null;
  return w.__TAURI_INTERNALS__?.invoke ?? w.__TAURI__?.core?.invoke ?? null;
}

export interface HttpOptions {
  method?: string;
  headers?: Record<string, string>;
  timeoutSecs?: number;
}

interface RustHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const DEFAULT_UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36';

async function rustRequest(url: string, options: HttpOptions, asText: boolean): Promise<string> {
  const invoke = getInvoke();
  if (!invoke) throw new Error('not-tauri');
  const response = (await invoke('make_http_request', {
    options: {
      url,
      method: options.method ?? 'GET',
      headers: options.headers ?? {},
      timeout_secs: options.timeoutSecs ?? 20,
      response_as_text: asText,
    },
  })) as RustHttpResponse;
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.body;
}

async function browserFetch(url: string, options: HttpOptions, kind: 'text' | 'json' | 'bytes') {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), (options.timeoutSecs ?? 20) * 1000);
  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (kind === 'bytes') return response.arrayBuffer();
    const text = await response.text();
    if (kind === 'json') return JSON.parse(text);
    return text;
  } finally {
    window.clearTimeout(timer);
  }
}

/** 请求 JSON：Tauri 内用原生命令（绕过 CORS），浏览器内直接 fetch。 */
export async function httpJson(url: string, options: HttpOptions = {}): Promise<unknown> {
  if (isTauri()) {
    const body = await rustRequest(url, options, true);
    return JSON.parse(body);
  }
  return browserFetch(url, options, 'json');
}

/** 请求文本（M3U / HTML）。 */
export async function httpText(url: string, options: HttpOptions = {}): Promise<string> {
  if (isTauri()) {
    const invoke = getInvoke();
    if (invoke) {
      try {
        return (await invoke('fetch_text_native', { url })) as string;
      } catch (error) {
        if (error instanceof Error && error.message !== 'not-tauri') {
          return (await rustRequest(url, options, true)) as string;
        }
      }
    }
    return rustRequest(url, options, true);
  }
  return browserFetch(url, options, 'text') as Promise<string>;
}

/** 请求二进制（HLS 分片）。 */
export async function httpBytes(url: string, options: HttpOptions = {}): Promise<ArrayBuffer> {
  if (isTauri()) {
    const invoke = getInvoke();
    if (!invoke) throw new Error('not-tauri');
    const value = (await invoke('fetch_bytes_native', { url })) as ArrayBuffer | Uint8Array;
    if (value instanceof ArrayBuffer) return value;
    if (value && (value as Uint8Array).buffer instanceof ArrayBuffer) {
      const view = value as Uint8Array;
      return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
    }
    return new Uint8Array(value as ArrayLike<number>).buffer;
  }
  return browserFetch(url, options, 'bytes') as Promise<ArrayBuffer>;
}

/** 调用 Rust 内置源搜索命令，返回原始 JSON 字符串。 */
export async function rustSearch(
  sourceId: string,
  query: string,
  customApiUrl?: string,
  page = 1,
): Promise<string> {
  const invoke = getInvoke();
  if (!invoke) throw new Error('not-tauri');
  return (await invoke('search_videos', {
    query,
    sourceId,
    customApiUrl: customApiUrl ?? null,
    page,
  })) as string;
}

export const USER_AGENT = DEFAULT_UA;