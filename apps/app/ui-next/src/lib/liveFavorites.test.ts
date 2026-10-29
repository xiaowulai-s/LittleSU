import { describe, expect, it } from 'vitest';
import { mergeLiveFavorite } from './liveFavorites';
import type { LiveFavorite } from './liveFavorites';

const base: LiveFavorite = { sourceKey: 'cn', channelId: 'cctv1', name: 'CCTV-1', group: '央视', at: 1 };

describe('直播收藏合并', () => {
  it('未收藏时置顶加入', () => {
    const next = mergeLiveFavorite([], { sourceKey: 'cn', channelId: 'cctv1', name: 'CCTV-1', group: '央视' });
    expect(next).toHaveLength(1);
    expect(next[0].channelId).toBe('cctv1');
  });

  it('已收藏时取消', () => {
    expect(mergeLiveFavorite([base], { sourceKey: 'cn', channelId: 'cctv1', name: 'CCTV-1', group: '央视' })).toEqual([]);
  });

  it('不同源的同名频道互不影响', () => {
    const next = mergeLiveFavorite([base], { sourceKey: 'hk', channelId: 'cctv1', name: 'CCTV-1', group: '央视' });
    expect(next).toHaveLength(2);
  });
});
