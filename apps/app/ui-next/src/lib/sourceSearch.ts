import { rustSearch } from './env';
import type { SourceDef } from './sources';

export const DEFAULT_SEARCH_TIMEOUT_SECS = 12;
export const DEFAULT_SEARCH_RETRIES = 0;
export const SEARCH_TIMEOUT_OPTIONS = [8, 12, 20, 30];
export const SEARCH_RETRY_OPTIONS = [0, 1, 2];

export interface SourceSearchOptions {
  timeoutSecs?: number;
  retries?: number;
}

export function normalizeSearchOptions(options: SourceSearchOptions = {}): Required<SourceSearchOptions> {
  const timeout = Math.round(options.timeoutSecs ?? DEFAULT_SEARCH_TIMEOUT_SECS);
  const retries = Math.round(options.retries ?? DEFAULT_SEARCH_RETRIES);
  return {
    timeoutSecs: Math.min(60, Math.max(3, timeout)),
    retries: Math.min(3, Math.max(0, retries)),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('搜索超时')), ms);
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** 单个源的搜索请求：按配置执行超时与失败重试，返回原始响应文本。 */
export async function fetchSourceSearch(
  source: SourceDef,
  query: string,
  page = 1,
  options: SourceSearchOptions = {},
): Promise<string> {
  const { timeoutSecs, retries } = normalizeSearchOptions(options);
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const request = source.custom
        ? rustSearch('custom', query, source.base, page, timeoutSecs)
        : rustSearch(source.key, query, undefined, page, timeoutSecs);
      return await withTimeout(request, timeoutSecs * 1000);
    } catch (error) {
      lastError = error;
      if (attempt < retries) await delay(350 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('搜索失败');
}
