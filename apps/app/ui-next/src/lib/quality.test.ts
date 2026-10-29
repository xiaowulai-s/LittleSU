import { describe, expect, it } from 'vitest';
import { pickQualityLevel, qualityLabel } from './quality';

describe('清晰度档位选择', () => {
  const levels = [{ height: 480 }, { height: 720 }, { height: 1080 }];

  it('优先精确匹配', () => {
    expect(pickQualityLevel(levels, 1080)).toBe(2);
  });

  it('没有精确档时取不高于目标的最大档', () => {
    expect(pickQualityLevel(levels, 2160)).toBe(2);
    expect(pickQualityLevel([{ height: 720 }, { height: 2160 }], 1080)).toBe(0);
  });

  it('无匹配或无目标时返回自动', () => {
    expect(pickQualityLevel([{ height: 2160 }], 1080)).toBe(-1);
    expect(pickQualityLevel(levels, 0)).toBe(-1);
    expect(pickQualityLevel([], 1080)).toBe(-1);
  });

  it('生成可读标签', () => {
    expect(qualityLabel({ height: 1080 }, 0)).toBe('1080P');
    expect(qualityLabel({ bitrate: 2500000 }, 1)).toBe('2500 kbps');
    expect(qualityLabel({}, 2)).toBe('线路 3');
  });
});
