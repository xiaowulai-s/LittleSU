import { afterEach, describe, expect, it, vi } from 'vitest';
import { installAndroidApk, stopAndroidPlayback, updateAndroidPlayback } from './androidNative';

afterEach(() => vi.unstubAllGlobals());

describe('androidNative bridge', () => {
  it('falls back when no native bridge exists', () => {
    expect(installAndroidApk('https://example.com/app.apk')).toBe(false);
    expect(() => updateAndroidPlayback('片名', '第 1 集', true, 30, 2700)).not.toThrow();
    expect(() => stopAndroidPlayback()).not.toThrow();
  });

  it('delegates to the injected bridge', () => {
    const bridge = {
      installApk: vi.fn(() => true),
      updatePlayback: vi.fn(),
      stopPlayback: vi.fn(),
    };
    vi.stubGlobal('window', { LsuNative: bridge });
    expect(installAndroidApk('https://example.com/app.apk')).toBe(true);
    expect(bridge.installApk).toHaveBeenCalledWith('https://example.com/app.apk');
    updateAndroidPlayback('片名', '第 1 集', true, 30, 2700);
    expect(bridge.updatePlayback).toHaveBeenCalledWith('片名', '第 1 集', true, 30, 2700);
    stopAndroidPlayback();
    expect(bridge.stopPlayback).toHaveBeenCalled();
  });

  it('returns false when the bridge throws', () => {
    vi.stubGlobal('window', { LsuNative: { installApk: () => { throw new Error('boom'); } } });
    expect(installAndroidApk('https://example.com/app.apk')).toBe(false);
  });
});
