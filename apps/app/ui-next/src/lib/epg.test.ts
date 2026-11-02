import { describe, expect, it } from 'vitest';
import { currentProgram, epgCandidates, nextProgram, parseXmltv } from './epg';

const xmltv = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="CCTV1"><display-name>CCTV-1 综合</display-name><display-name>CCTV1</display-name></channel>
  <channel id="CCTV2"><display-name>CCTV-2 财经</display-name></channel>
  <programme start="20261102190000 +0800" stop="20261102200000 +0800" channel="CCTV1"><title lang="zh">新闻联播 &amp; 天气</title></programme>
  <programme start="20261102200000 +0800" stop="20261102210000 +0800" channel="CCTV1"><title>焦点访谈</title></programme>
  <programme start="20261103190000 +0800" stop="20261103200000 +0800" channel="CCTV1"><title>明天的节目</title></programme>
  <programme start="20261102190000 +0800" stop="20261102200000 +0800" channel="CCTV2"><title>财经新闻</title></programme>
</tv>`;

describe('epgCandidates', () => {
  it('优先使用 tvg-id，并去掉清晰度后缀', () => {
    expect(epgCandidates({ name: 'CCTV-1 综合 高清', tvgId: 'CCTV1.cn' })).toEqual(['CCTV1', 'CCTV-1综合']);
  });

  it('没有 tvg-id 时回落到频道名', () => {
    expect(epgCandidates({ name: '湖南卫视 高清', tvgId: '' })).toEqual(['湖南卫视']);
  });
});

describe('program lookup', () => {
  const programs = [
    { start: '08:00', end: '09:00', title: '早间新闻' },
    { start: '09:00', end: '10:30', title: '纪录片' },
  ];

  it('按当前时间匹配正在播出的节目', () => {
    const at = new Date(2026, 0, 1, 9, 30);
    expect(currentProgram(programs, at)?.title).toBe('纪录片');
    expect(nextProgram(programs, at)).toBeUndefined();
  });

  it('匹配跨零点的节目', () => {
    const late = [{ start: '23:30', end: '00:30', title: '深夜剧场' }];
    expect(currentProgram(late, new Date(2026, 0, 1, 23, 45))?.title).toBe('深夜剧场');
    expect(currentProgram(late, new Date(2026, 0, 2, 0, 15))?.title).toBe('深夜剧场');
    expect(currentProgram(late, new Date(2026, 0, 2, 1, 0))).toBeUndefined();
  });
});

describe('parseXmltv', () => {
  it('按 tvg-id 匹配频道并只返回目标日期的节目', () => {
    const result = parseXmltv(xmltv, { name: 'CCTV-1 高清', tvgId: 'CCTV1.cn' }, '2026-11-02');
    expect(result?.channelName).toBe('CCTV-1 综合');
    expect(result?.programs).toEqual([
      { start: '19:00', end: '20:00', title: '新闻联播 & 天气' },
      { start: '20:00', end: '21:00', title: '焦点访谈' },
    ]);
  });

  it('没有 tvg-id 时按频道名匹配', () => {
    const result = parseXmltv(xmltv, { name: 'CCTV-2 高清', tvgId: '' }, '2026-11-02');
    expect(result?.programs[0]?.title).toBe('财经新闻');
  });

  it('频道或日期不匹配时返回空', () => {
    expect(parseXmltv(xmltv, { name: '湖南卫视', tvgId: '' }, '2026-11-02')).toBeNull();
    expect(parseXmltv(xmltv, { name: 'CCTV-1 高清', tvgId: 'CCTV1' }, '2026-11-04')).toBeNull();
  });

  it('不会把 CCTV-1 宽松匹配到 CCTV-10', () => {
    const cctv10 = `<tv><channel id="CCTV10"><display-name>CCTV-10 科教</display-name></channel>
      <programme start="20261102190000 +0800" stop="20261102200000 +0800" channel="CCTV10"><title>探索</title></programme></tv>`;
    expect(parseXmltv(cctv10, { name: 'CCTV-1 高清', tvgId: '' }, '2026-11-02')).toBeNull();
  });
});
