import { describe, expect, it } from 'vitest';
import { mergeVariantCandidates } from './variants';
import type { Title } from '../data';

const detail: Title = {
  id: 'lzi:1',
  key: 'lzi:1',
  name: '庆余年 第二季',
  year: 2024,
  rating: 8.9,
  type: '剧集',
  region: '中国大陆',
  genres: ['古装'],
  synopsis: '',
  episodes: 36,
  duration: '',
  hue: 0,
  source: '量子资源',
  quality: '4K',
  sourceKey: 'lzi',
  vodId: '1',
};

describe('详情多源合并', () => {
  it('同名片源并入 variants', () => {
    const merged = mergeVariantCandidates(detail, [
      { title: { ...detail, key: 'ffzy:2', id: 'ffzy:2', name: '庆余年第二季', vodId: '2', source: '非凡影视', playable: 1 }, sourceKey: 'ffzy', sourceName: '非凡影视' },
      { title: { ...detail, key: 'x:3', id: 'x:3', name: '另一部剧', vodId: '3' }, sourceKey: 'x', sourceName: '其他源' },
    ]);
    expect(merged.variants).toHaveLength(2);
    expect(merged.variants?.map((v) => v.sourceKey).sort()).toEqual(['ffzy', 'lzi']);
    expect(merged.sources?.sort()).toEqual(['量子资源', '非凡影视']);
  });

  it('没有匹配源时保持原样', () => {
    expect(mergeVariantCandidates(detail, [])).toBe(detail);
  });
});
