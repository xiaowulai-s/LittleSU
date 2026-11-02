import { describe, expect, it } from 'vitest';
import { EMPTY_SKIP_MARKS, shouldSkipIntro, shouldSkipOutro } from './skipMarks';

describe('skip marks', () => {
  it('skips only inside a valid intro range', () => {
    const marks = { introEnd: 90, outroStart: 0 };
    expect(shouldSkipIntro(5, marks)).toBe(true);
    expect(shouldSkipIntro(0.2, marks)).toBe(false);
    expect(shouldSkipIntro(90, marks)).toBe(false);
    expect(shouldSkipIntro(5, EMPTY_SKIP_MARKS)).toBe(false);
  });

  it('skips only inside a valid outro range', () => {
    const marks = { introEnd: 0, outroStart: 1300 };
    expect(shouldSkipOutro(1300, 1400, marks)).toBe(true);
    expect(shouldSkipOutro(1200, 1400, marks)).toBe(false);
    expect(shouldSkipOutro(1300, 1300, marks)).toBe(false);
    expect(shouldSkipOutro(1300, 1400, EMPTY_SKIP_MARKS)).toBe(false);
  });
});
