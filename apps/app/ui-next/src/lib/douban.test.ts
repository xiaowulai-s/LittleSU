import { describe, expect, it } from 'vitest';
import { resolveDoubanQuery } from './douban';

describe('豆瓣榜单查询', () => {
  it('Top250 使用 rank 排序', () => {
    expect(resolveDoubanQuery('top-movie')).toEqual({ type: 'movie', tag: '豆瓣电影Top250', sort: 'rank' });
  });

  it('最新榜单按时间排序', () => {
    expect(resolveDoubanQuery('latest-tv')).toEqual({ type: 'tv', tag: '最新', sort: 'time' });
  });

  it('分类优先于榜单标签并固定推荐排序', () => {
    expect(resolveDoubanQuery('high-movie', '喜剧')).toEqual({ type: 'movie', tag: '喜剧', sort: 'recommend' });
    expect(resolveDoubanQuery('hot-tv', '国产剧')).toEqual({ type: 'tv', tag: '国产剧', sort: 'recommend' });
  });

  it('未知榜单返回 null', () => {
    expect(resolveDoubanQuery('unknown' as never)).toBeNull();
  });
});
