import { describe, expect, it } from 'vitest';
import { parseDoubanAbstract, parseDoubanRexxar, resolveDoubanQuery } from './douban';

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

describe('豆瓣详情解析', () => {
  it('解析 rexxar 详情', () => {
    const detail = parseDoubanRexxar({
      id: '1292052',
      title: '肖申克的救赎',
      original_title: 'The Shawshank Redemption',
      year: '1994',
      rating: { value: 9.7 },
      pic: { large: 'https://img.example/poster.jpg' },
      intro: '希望让人自由。',
      genres: ['犯罪', '剧情'],
      directors: ['弗兰克·德拉邦特'],
      actors: ['蒂姆·罗宾斯', '摩根·弗里曼'],
      countries: ['美国'],
      durations: ['142分钟'],
      episodes_count: 0,
    }, false);
    expect(detail).toMatchObject({
      id: '1292052',
      title: '肖申克的救赎',
      searchTitle: '肖申克的救赎',
      year: '1994',
      rating: '9.7',
      cover: 'https://img.example/poster.jpg',
      genres: ['犯罪', '剧情'],
      duration: '142分钟',
      isTv: false,
    });
  });

  it('解析 subject_abstract 兜底并提取中文搜索名', () => {
    const detail = parseDoubanAbstract({
      subject: {
        id: '1292052',
        title: '肖申克的救赎 The Shawshank Redemption‎ (1994)',
        rate: '9.7',
        release_year: '1994',
        types: ['犯罪', '剧情'],
        directors: ['弗兰克·德拉邦特'],
        actors: ['蒂姆·罗宾斯'],
        region: '美国',
        duration: '142分钟',
        is_tv: false,
        short_comment: { content: '希望让人自由。' },
      },
    }, false);
    expect(detail?.searchTitle).toBe('肖申克的救赎');
    expect(detail?.shortComment).toBe('希望让人自由。');
    expect(detail?.rating).toBe('9.7');
  });

  it('缺少 id/title 时返回 null', () => {
    expect(parseDoubanRexxar({ title: '无 id' }, false)).toBeNull();
    expect(parseDoubanAbstract({ subject: { title: '无 id' } }, false)).toBeNull();
  });
});
