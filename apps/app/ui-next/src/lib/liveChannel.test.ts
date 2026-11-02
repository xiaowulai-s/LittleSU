import { describe, expect, it } from 'vitest';
import { channelKey, findChannelMatch, normalizeChannelName, sameChannel } from './liveChannel';

describe('直播频道归一化', () => {
  it('去掉清晰度、空格与常见后缀', () => {
    expect(normalizeChannelName('CCTV-1 综合 高清')).toBe('cctv1');
    expect(normalizeChannelName('湖南卫视-高清')).toBe('湖南卫视');
    expect(normalizeChannelName('CCTV5 体育')).toBe('cctv5体育');
    expect(normalizeChannelName('CCTV-1 HD (1080p)')).toBe('cctv1');
    expect(normalizeChannelName('CCTV1綜合')).toBe('cctv1');
  });

  it('归一化后同名频道视为同一频道', () => {
    expect(sameChannel({ name: 'CCTV-1 综合', tvgId: '' }, { name: 'CCTV1', tvgId: '' })).toBe(true);
    expect(sameChannel({ name: 'CCTV-1 (720p)', tvgId: '' }, { name: 'CCTV1綜合', tvgId: '' })).toBe(true);
    expect(sameChannel({ name: '湖南卫视 高清', tvgId: '' }, { name: '湖南卫视', tvgId: '' })).toBe(true);
    expect(sameChannel({ name: 'CCTV1', tvgId: 'cctv1' }, { name: '其他', tvgId: 'CCTV1' })).toBe(true);
  });

  it('不同频道不匹配', () => {
    expect(sameChannel({ name: 'CCTV1', tvgId: '' }, { name: 'CCTV2', tvgId: '' })).toBe(false);
  });

  it('从频道列表中找到同频道', () => {
    const list = [
      { name: 'CCTV2', tvgId: '' },
      { name: 'CCTV-1 综合 高清', tvgId: '' },
    ];
    expect(findChannelMatch(list, { name: 'CCTV1', tvgId: '' })).toBe(list[1]);
    expect(findChannelMatch(list, { name: 'CCTV5', tvgId: '' })).toBeUndefined();
  });

  it('空名称回落到 tvg-id', () => {
    expect(channelKey({ name: '', tvgId: 'CCTV1' })).toBe('cctv1');
  });
});
