import { describe, expect, it } from 'vitest';
import { clampSubtitleOffset, normalizeSubtitle, shiftVtt, srtToVtt } from './subtitles';

describe('字幕格式转换', () => {
  it('SRT 时间戳逗号转点并去掉序号行', () => {
    const srt = '1\n00:00:01,500 --> 00:00:03,000\n你好\n\n2\n00:00:04,000 --> 00:00:05,200\n世界\n';
    const vtt = srtToVtt(srt);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toContain('00:00:01.500 --> 00:00:03.000');
    expect(vtt).not.toMatch(/^1$/m);
    expect(vtt).toContain('世界');
  });

  it('已是 WebVTT 时原样保留', () => {
    const vtt = 'WEBVTT\n\n00:01.000 --> 00:03.000\nhi';
    expect(normalizeSubtitle(vtt)).toBe(vtt);
  });
});

describe('字幕时间轴偏移', () => {
  it('正偏移会平移所有 cue', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n你好\n\n00:01.000 --> 00:02.000\n短格式';
    const shifted = shiftVtt(vtt, 1);
    expect(shifted).toContain('00:00:02.000 --> 00:00:04.000');
    expect(shifted).toContain('00:00:02.000 --> 00:00:03.000');
  });

  it('偏移后结束不晚于 0 的 cue 被丢弃', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n早期\n\n00:00:10.000 --> 00:00:12.000\n保留';
    const shifted = shiftVtt(vtt, -5);
    expect(shifted).not.toContain('早期');
    expect(shifted).toContain('00:00:05.000 --> 00:00:07.000');
  });

  it('偏移限制在 ±10 秒且按 0.5 秒步进', () => {
    expect(clampSubtitleOffset(20)).toBe(10);
    expect(clampSubtitleOffset(-20)).toBe(-10);
    expect(clampSubtitleOffset(1.26)).toBe(1.5);
  });
});
