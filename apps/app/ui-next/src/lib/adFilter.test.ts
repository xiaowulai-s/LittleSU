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

  it('识别常见广告段命名', () => {
    const input = [
      '#EXTM3U',
      '#EXTINF:6,',
      'https://cdn.example/guanggao/pre.ts',
      '#EXTINF:6,',
      'https://cdn.example/video/sponsor_clip.ts',
      '#EXTINF:6,',
      'https://cdn.example/video/ads-2026.ts',
      '#EXTINF:6,',
      'https://cdn.example/video/main_01.ts',
    ].join('\n');
    const output = filterAdsFromM3U8(input);
    expect(output).not.toContain('guanggao');
    expect(output).not.toContain('sponsor_clip');
    expect(output).not.toContain('ads-2026');
    expect(output).toContain('main_01.ts');
    expect((output.match(/#EXTINF/g) || []).length).toBe(1);
  });

  it('不误伤包含 ad 子串的正常文件名', () => {
    const input = [
      '#EXTINF:4,',
      'https://cdn.example/upload/seg.ts',
      '#EXTINF:4,',
      'https://cdn.example/download/seg-2.ts',
      '#EXTINF:4,',
      'https://cdn.example/shadow/seg-3.ts',
    ].join('\n');
    expect(filterAdsFromM3U8(input)).toBe(input);
  });

  it('首条就是广告时不会留下悬挂的 EXTINF', () => {
    const input = ['#EXTM3U', '#EXTINF:4,', 'https://cdn.example/ad/first.ts', '#EXTINF:4,', 'https://cdn.example/seg.ts'].join('\n');
    const output = filterAdsFromM3U8(input);
    expect(output).not.toContain('first.ts');
    expect((output.match(/#EXTINF/g) || []).length).toBe(1);
    expect(output.trim().endsWith('seg.ts')).toBe(true);
  });
});