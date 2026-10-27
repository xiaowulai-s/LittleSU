import { describe, expect, it } from 'vitest';
import { isSourceHealthy } from './sources';
import type { SourceDef } from './sources';

const base: SourceDef = { key: 'demo', name: 'Demo', host: 'demo.test', base: 'https://demo.test', status: 'ok', latency: 0 };

describe('isSourceHealthy', () => {
  it('没有测活结果时回落到内置状态', () => {
    expect(isSourceHealthy(base, {})).toBe(true);
    expect(isSourceHealthy({ ...base, status: 'backup' }, {})).toBe(false);
  });

  it('有测活结果时以测活为准', () => {
    expect(isSourceHealthy({ ...base, status: 'backup' }, { demo: { status: 'ok' } })).toBe(true);
    expect(isSourceHealthy(base, { demo: { status: 'fail' } })).toBe(false);
  });

  it('自定义源在未测活时默认可用', () => {
    expect(isSourceHealthy({ ...base, custom: true, status: 'backup' }, {})).toBe(true);
  });
});
