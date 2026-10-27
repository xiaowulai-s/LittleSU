import { isTauri, rustSearch } from './env';
import type { SourceDef } from './sources';

export interface SourceHealth {
  status: 'ok' | 'fail';
  latency: number;
  checkedAt: number;
}

const TIMEOUT_MS = 12000;

function withTimeout<T>(promise: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('测活超时')), ms);
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

/** 用一次真实搜索测试源可用性与延迟。浏览器内无 Tauri 命令，返回失败。 */
export async function testSource(source: SourceDef, query = '电影'): Promise<SourceHealth> {
  const checkedAt = Date.now();
  if (!isTauri()) return { status: 'fail', latency: -1, checkedAt };
  const started = performance.now();
  try {
    const request = source.custom
      ? rustSearch('custom', query, source.base)
      : rustSearch(source.key, query);
    const raw = await withTimeout(request);
    const parsed = JSON.parse(raw) as { list?: unknown };
    if (!Array.isArray(parsed.list)) throw new Error('响应不是有效片单');
    return { status: 'ok', latency: Math.round(performance.now() - started), checkedAt };
  } catch {
    return { status: 'fail', latency: -1, checkedAt };
  }
}