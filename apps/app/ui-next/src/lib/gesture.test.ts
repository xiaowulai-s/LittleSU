import { describe, expect, it } from 'vitest';
import { clampBrightness, clampVolume, doubleTapSeekSeconds, gestureRatio, isDoubleTap, tapSide } from './gesture';

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

  it('双击按左右半屏判定快退/快进 10 秒', () => {
    expect(tapSide(10, 390)).toBe('left');
    expect(tapSide(380, 390)).toBe('right');
    expect(doubleTapSeekSeconds('left')).toBe(-10);
    expect(doubleTapSeekSeconds('right')).toBe(10);
  });

  it('双击时间窗口与同侧判定', () => {
    expect(isDoubleTap({ at: 1000, side: 'left' }, 1300, 'left')).toBe(true);
    expect(isDoubleTap({ at: 1000, side: 'left' }, 1400, 'left')).toBe(false);
    expect(isDoubleTap({ at: 1000, side: 'left' }, 1100, 'right')).toBe(false);
    expect(isDoubleTap(null, 1100, 'left')).toBe(false);
  });
});
