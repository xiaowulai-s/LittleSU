import { describe, expect, it } from 'vitest';
import { favoriteMatchesChannel, mergeLiveFavorite } from './liveFavorites';
import type { LiveFavorite } from './liveFavorites';

const base: LiveFavorite = { sourceKey: 'cn', channelId: 'cctv1', name: 'CCTV-1', group: '央视', at: 1 };

describe('直播收藏合并', () => {
  it('未收藏时置顶加入并写入归一化 key', () => {
    const next = mergeLiveFavorite([], { sourceKey: 'cn', channelId: 'cctv1', name: 'CCTV-1 高清', group: '央视' });
    expect(next).toHaveLength(1);
    expect(next[0].channelId).toBe('cctv1');
    expect(next[0].key).toBe('cctv1');
  });

  it('同源已收藏时取消', () => {
    expect(mergeLiveFavorite([base], { sourceKey: 'cn', channelId: 'cctv1', name: 'CCTV-1', group: '央视' })).toEqual([]);
  });

  it('不同源的同名频道视为同一收藏，跨源点收藏会取消', () => {
    expect(mergeLiveFavorite([base], { sourceKey: 'hk', channelId: 'cctv1-hk', name: 'CCTV1 高清', group: '央视' })).toEqual([]);
    const added = mergeLiveFavorite([], { sourceKey: 'hk', channelId: 'cctv1-hk', name: 'CCTV1 高清', group: '央视' });
    expect(added).toHaveLength(1);
    expect(added[0].sourceKey).toBe('hk');
    expect(mergeLiveFavorite(added, { sourceKey: 'cn', channelId: 'cctv1', name: 'CCTV-1', group: '央视' })).toEqual([]);
  });

  it('频道匹配使用归一化名称', () => {
    expect(favoriteMatchesChannel(base, { name: 'CCTV-1 综合 高清', tvgId: '' })).toBe(true);
    expect(favoriteMatchesChannel(base, { name: 'CCTV2', tvgId: '' })).toBe(false);
  });
});
