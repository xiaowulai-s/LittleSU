import { describe, expect, it } from 'vitest';
import { currentProgram, epgCandidates, nextProgram } from './epg';

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
