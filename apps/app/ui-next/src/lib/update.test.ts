import { describe, expect, it } from 'vitest';
import { compareVersion } from './update';

describe('版本比较', () => {
  it('按点分段比较', () => {
    expect(compareVersion('1.4.0', '1.3.1')).toBeGreaterThan(0);
    expect(compareVersion('1.3.1', '1.3.1')).toBe(0);
    expect(compareVersion('1.3.10', '1.3.2')).toBeGreaterThan(0);
    expect(compareVersion('2.0', '1.9.9')).toBeGreaterThan(0);
  });
});
