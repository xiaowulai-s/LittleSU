import { describe, expect, it } from 'vitest';
import { filterAdsFromM3U8 } from './adFilter';

describe('HLS 广告过滤', () => {
  it('移除 discontinuity 与广告切片', () => {
    const input = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXTINF:4,',
      'https://cdn.example/seg-1.ts',
      '#EXT-X-DISCONTINUITY',
      '#EXTINF:5,',
      'https://cdn.example/ad/seg-ad.ts',
      '#EXTINF:4,',
      'https://cdn.example/seg-2.ts',
    ].join('\n');
    const output = filterAdsFromM3U8(input);
    expect(output).not.toContain('#EXT-X-DISCONTINUITY');
    expect(output).not.toContain('seg-ad');
    expect(output).toContain('seg-1.ts');
    expect(output).toContain('seg-2.ts');
    expect((output.match(/#EXTINF/g) || []).length).toBe(2);
  });

  it('保留与广告无关的普通路径', () => {
    const input = '#EXTINF:4,\nhttps://cdn.example/load/seg.ts';
    expect(filterAdsFromM3U8(input)).toBe(input);
  });
});