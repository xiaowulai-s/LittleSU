import { describe, expect, it } from 'vitest';
import { groupChannels, parsePlaylist } from './liveParser';

describe('直播列表解析', () => {
  it('解析 M3U 并去重', () => {
    const text = [
      '#EXTM3U',
      '#EXTINF:-1 tvg-id="cctv1" group-title="央视频道",CCTV-1 综合',
      'http://a/live/cctv1.m3u8',
      '#EXTINF:-1 group-title="卫视",湖南卫视',
      'http://a/live/hunan.m3u8',
      '#EXTINF:-1 group-title="央视频道",重复频道',
      'http://a/live/cctv1.m3u8',
    ].join('\n');
    const channels = parsePlaylist(text);
    expect(channels).toHaveLength(2);
    expect(channels[0]).toMatchObject({ name: 'CCTV-1 综合', group: '央视频道', tvgId: 'cctv1' });
    expect(groupChannels(channels)).toEqual(['全部', '央视频道', '卫视']);
  });

  it('解析纯文本频道列表（#genre# 分组）', () => {
    const text = ['央视,#genre#', 'CCTV1,http://b/cctv1.m3u8', 'CCTV2,http://b/cctv2.m3u8', '卫视,#genre#', '湖南卫视,http://b/hunan.m3u8'].join('\n');
    const channels = parsePlaylist(text);
    expect(channels).toHaveLength(3);
    expect(channels[2]).toMatchObject({ name: '湖南卫视', group: '卫视' });
  });
});