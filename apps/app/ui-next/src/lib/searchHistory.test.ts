import { describe, expect, it } from 'vitest';
import { mergeSearchHistory } from './searchHistory';

describe('搜索历史合并', () => {
  it('新搜索置顶并去重', () => {
    expect(mergeSearchHistory(['庆余年', '三体'], '三体')).toEqual(['三体', '庆余年']);
  });

  it('空搜索不写入', () => {
    expect(mergeSearchHistory(['庆余年'], '   ')).toEqual(['庆余年']);
  });

  it('最多保留 12 条', () => {
    const list = Array.from({ length: 12 }, (_, index) => `关键词 ${index}`);
    const next = mergeSearchHistory(list, '新的');
    expect(next).toHaveLength(12);
    expect(next[0]).toBe('新的');
    expect(next).not.toContain('关键词 11');
  });
});
