import { describe, expect, it } from 'vitest';
import { applyDetail, buildTitle, dedupeTitles, parsePlayLines, parsePlayUrl, parseSearchPage, parseSearchResponse, qualityFrom } from './cms';
import type { SourceDef } from './sources';

const source: SourceDef = {
  key: 'lzi',
  name: '量子资源',
  host: 'cj.lziapi.com',
  base: 'https://cj.lziapi.com',
  status: 'ok',
  latency: 320,
};

describe('cms 解析', () => {
  it('从搜索响应生成统一条目', () => {
    const raw = JSON.stringify({
      list: [
        {
          vod_id: 100,
          vod_name: '庆余年 第二季',
          vod_pic: 'https://img.example/poster.jpg',
          vod_year: '2024',
          vod_score: '8.9',
          vod_remarks: '更新至第12集 4K',
          type_name: '国产剧',
          vod_area: '中国大陆',
          vod_content: '范闲重返京都。',
        },
      ],
    });
    const titles = parseSearchResponse(raw, source, source.name);
    expect(titles).toHaveLength(1);
    expect(titles[0].name).toBe('庆余年 第二季');
    expect(titles[0].type).toBe('剧集');
    expect(titles[0].quality).toBe('4K');
    expect(titles[0].rating).toBe(8.9);
    expect(titles[0].key).toBe('lzi:100');
    expect(titles[0].source).toBe('量子资源');
  });

  it('解析 vod_play_url 为剧集列表并去重', () => {
    const raw = '第01集$https://cdn/a1.m3u8#第02集$https://cdn/a2.m3u8#重播$https://cdn/a1.m3u8';
    const episodes = parsePlayUrl(raw);
    expect(episodes).toHaveLength(2);
    expect(episodes[0]).toEqual({ name: '第01集', url: 'https://cdn/a1.m3u8' });
  });

  it('无结构化剧集时从文本提取 m3u8', () => {
    const episodes = parsePlayUrl('正片 https://cdn/movie.m3u8 备用');
    expect(episodes).toHaveLength(1);
    expect(episodes[0].url).toBe('https://cdn/movie.m3u8');
  });

  it('按 $$$ 拆分同源多线路，不再把两套剧集拼在一起', () => {
    const raw = [
      '第1集$https://cdn/a1.m3u8#第2集$https://cdn/a2.m3u8',
      '第1集$https://cdn/b1.m3u8#第2集$https://cdn/b2.m3u8',
    ].join('$$$');
    const lines = parsePlayLines(raw, '量子$$$备用');
    expect(lines).toHaveLength(2);
    expect(lines[0].name).toBe('量子');
    expect(lines[1].name).toBe('备用');
    expect(lines[0].episodes).toHaveLength(2);
    expect(lines[1].episodes[0].url).toBe('https://cdn/b1.m3u8');
  });

  it('读取搜索响应的 pagecount', () => {
    const raw = JSON.stringify({ pagecount: 3, list: [{ vod_id: 1, vod_name: '测试', type_name: '电影' }] });
    const page = parseSearchPage(raw, source, source.name);
    expect(page.pageCount).toBe(3);
    expect(page.titles).toHaveLength(1);
  });

  it('跨源去重并合并来源', () => {
    const a = buildTitle({ vod_id: 1, vod_name: '流浪地球 2', vod_year: '2023', vod_pic: 'p', type_name: '电影' }, source, '量子资源')!;
    const b = buildTitle({ vod_id: 2, vod_name: '流浪地球 2', vod_year: '2023', type_name: '电影' }, { ...source, key: 'bfzy', name: '暴风资源' }, '暴风资源')!;
    const merged = dedupeTitles([a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].sources?.sort()).toEqual(['暴风资源', '量子资源']);
  });

  it('清晰度识别', () => {
    expect(qualityFrom('4K 高清')).toBe('4K');
    expect(qualityFrom('1080P')).toBe('1080P');
    expect(qualityFrom('完结')).toBe('HD');
  });

  it('默认选择直链 m3u8 最多的线路', () => {
    const base = buildTitle({ vod_id: 1, vod_name: '测试', type_name: '剧集' }, source, source.name)!;
    const title = applyDetail(base, {
      vod_play_from: '分享$$$直链',
      vod_play_url: '第1集$https://v.example/share/abc$$$第1集$https://cdn.example/1.m3u8',
    });
    expect(title.playLineIndex).toBe(1);
    expect(title.playLines?.[1].name).toBe('直链');
    expect(title.episodesList?.[0].url).toBe('https://cdn.example/1.m3u8');
  });
});