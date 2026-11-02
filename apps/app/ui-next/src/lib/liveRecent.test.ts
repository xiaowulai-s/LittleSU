import { describe, expect, it } from 'vitest';
import { recordLiveRecent } from './liveRecent';
import type { LiveRecent } from './liveRecent';

const item = (name: string, sourceKey = 'cn', channelId = name): Omit<LiveRecent, 'at' | 'key'> => ({
  name,
  group: '央视',
  sourceKey,
  sourceName: sourceKey,
  channelId,
});

describe('直播最近观看', () => {
  it('新记录置顶并去重同频道', () => {
    const first = recordLiveRecent([], item('CCTV-1'));
    const second = recordLiveRecent(first, item('CCTV1', 'hk'));
    expect(second).toHaveLength(1);
    expect(second[0].sourceKey).toBe('hk');
    expect(second[0].key).toBe('cctv1');
  });

  it('不同频道都保留', () => {
    const list = recordLiveRecent(recordLiveRecent([], item('CCTV1')), item('CCTV2'));
    expect(list.map((entry) => entry.key)).toEqual(['cctv2', 'cctv1']);
  });
});
