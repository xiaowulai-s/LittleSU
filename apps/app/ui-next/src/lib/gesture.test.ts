import { describe, expect, it } from 'vitest';
import { clampBrightness, clampVolume, gestureRatio } from './gesture';

describe('手势换算', () => {
  it('向上滑动为正、向下为负', () => {
    expect(gestureRatio(600, 400, 800)).toBeGreaterThan(0);
    expect(gestureRatio(400, 600, 800)).toBeLessThan(0);
  });

  it('小视口按 320px 归一，避免过于灵敏', () => {
    expect(gestureRatio(200, 100, 300)).toBe(100 / 320);
  });

  it('亮度限制在 30%–160%，音量限制在 0–100%', () => {
    expect(clampBrightness(0.1)).toBe(0.3);
    expect(clampBrightness(2)).toBe(1.6);
    expect(clampVolume(-0.2)).toBe(0);
    expect(clampVolume(1.4)).toBe(1);
  });
});
