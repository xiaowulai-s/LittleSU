import { describe, expect, it } from 'vitest';
import { compareVersion, pickAndroidAsset } from './update';

describe('版本比较', () => {
  it('按点分段比较', () => {
    expect(compareVersion('1.4.0', '1.3.1')).toBeGreaterThan(0);
    expect(compareVersion('1.3.1', '1.3.1')).toBe(0);
    expect(compareVersion('1.3.10', '1.3.2')).toBeGreaterThan(0);
    expect(compareVersion('2.0', '1.9.9')).toBeGreaterThan(0);
  });
});

describe('Android 更新资产', () => {
  it('优先通用 APK', () => {
    expect(
      pickAndroidAsset([
        { name: 'LittleSU-TV-v1.6.0-android-arm64-v8a.apk', browser_download_url: 'https://x/arm64.apk' },
        { name: 'LittleSU-TV-v1.6.0-android-universal.apk', browser_download_url: 'https://x/universal.apk' },
      ]),
    ).toBe('https://x/universal.apk');
  });

  it('没有 APK 时返回 undefined', () => {
    expect(pickAndroidAsset([{ name: 'latest.json', browser_download_url: 'https://x/latest.json' }])).toBeUndefined();
    expect(pickAndroidAsset(undefined)).toBeUndefined();
  });
});
