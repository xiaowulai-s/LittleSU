import { describe, expect, it } from 'vitest';
import { normalizeSubtitle, srtToVtt } from './subtitles';

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
