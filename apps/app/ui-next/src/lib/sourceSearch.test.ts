import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rustSearch } from './env';
import type { SourceDef } from './sources';
import {
  DEFAULT_SEARCH_RETRIES,
  DEFAULT_SEARCH_TIMEOUT_SECS,
  fetchSourceSearch,
  normalizeSearchOptions,
} from './sourceSearch';

vi.mock('./env', () => ({ rustSearch: vi.fn() }));

const mockedSearch = vi.mocked(rustSearch);
const source: SourceDef = {
  key: 'demo',
  name: '演示源',
  host: 'demo.test',
  base: 'https://demo.test',
  status: 'ok',
  latency: 0,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (id: number) => clearTimeout(id) });
  mockedSearch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('normalizeSearchOptions', () => {
  it('uses defaults when options are omitted', () => {
    expect(normalizeSearchOptions()).toEqual({
      timeoutSecs: DEFAULT_SEARCH_TIMEOUT_SECS,
      retries: DEFAULT_SEARCH_RETRIES,
    });
  });

  it('clamps timeout and retries to safe ranges', () => {
    expect(normalizeSearchOptions({ timeoutSecs: 1, retries: 9 })).toEqual({ timeoutSecs: 3, retries: 3 });
    expect(normalizeSearchOptions({ timeoutSecs: 999, retries: -2 })).toEqual({ timeoutSecs: 60, retries: 0 });
  });

  it('rounds fractional values', () => {
    expect(normalizeSearchOptions({ timeoutSecs: 12.6, retries: 1.4 })).toEqual({ timeoutSecs: 13, retries: 1 });
  });
});

describe('fetchSourceSearch', () => {
  it('passes the configured timeout to the native search command', async () => {
    mockedSearch.mockResolvedValue('{"list":[]}');
    await expect(fetchSourceSearch(source, '电影', 2, { timeoutSecs: 20, retries: 0 })).resolves.toBe('{"list":[]}');
    expect(mockedSearch).toHaveBeenCalledWith('demo', '电影', undefined, 2, 20);
  });

  it('retries a failed request and returns the later response', async () => {
    mockedSearch.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce('{"list":[1]}');
    const promise = fetchSourceSearch(source, '电影', 1, { retries: 1 });
    await vi.advanceTimersByTimeAsync(400);
    await expect(promise).resolves.toBe('{"list":[1]}');
    expect(mockedSearch).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retry budget is exhausted', async () => {
    mockedSearch.mockRejectedValue(new Error('network'));
    const promise = fetchSourceSearch(source, '电影', 1, { retries: 2 });
    const assertion = expect(promise).rejects.toThrow('network');
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
    expect(mockedSearch).toHaveBeenCalledTimes(3);
  });

  it('times out a hung request', async () => {
    mockedSearch.mockImplementation(() => new Promise(() => undefined));
    const promise = fetchSourceSearch(source, '电影', 1, { timeoutSecs: 3, retries: 0 });
    const assertion = expect(promise).rejects.toThrow('搜索超时');
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;
    expect(mockedSearch).toHaveBeenCalledTimes(1);
  });
});
