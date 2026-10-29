import { describe, expect, it } from 'vitest';
import { SOURCES, isSourceHealthy, searchableSources } from './sources';import type { SourceDef } from './sources';

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

describe('searchableSources', () => {
  it('批量搜索排除 HTML 占位源并并入自定义源', () => {
    const list = searchableSources([{ name: '自定义', url: 'https://custom.test' }]);
    const experimentalCount = SOURCES.filter((source) => source.status === 'experimental').length;
    expect(list).toHaveLength(SOURCES.length - experimentalCount + 1);
    expect(list.some((source) => source.status === 'experimental')).toBe(false);
    expect(list.at(-1)?.custom).toBe(true);
  });

  it('停用的自定义源不参与批量搜索', () => {
    const list = searchableSources([
      { name: '启用', url: 'https://on.test', enabled: true },
      { name: '停用', url: 'https://off.test', enabled: false },
    ]);
    expect(list.some((source) => source.name === '启用')).toBe(true);
    expect(list.some((source) => source.name === '停用')).toBe(false);
  });
});
