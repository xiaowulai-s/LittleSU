import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAndroidMediaVolume,
  getAndroidScreenBrightness,
  hasAndroidMediaBridge,
  installAndroidApk,
  isApkUrl,
  openAndroidCastSettings,
  resetAndroidScreenBrightness,
  scheduleAndroidEpgReminder,
  setAndroidMediaVolume,
  setAndroidScreenBrightness,
  stopAndroidPlayback,
  updateAndroidPlayback,
  cancelAndroidEpgReminder,
  castChromecastDevice,
  castDlnaDevice,
  discoverDlnaDevices,
  hasChromecastSupport,
  stopChromecastDevice,
  stopDlnaDevice,
} from './androidNative';

afterEach(() => vi.unstubAllGlobals());

describe('isApkUrl', () => {
  it('accepts APK asset links and rejects release pages', () => {
    expect(isApkUrl('https://github.com/x/x/releases/download/v1/app.apk')).toBe(true);
    expect(isApkUrl('https://github.com/x/x/releases/download/v1/app.APK?x=1')).toBe(true);
    expect(isApkUrl('https://github.com/x/x/releases/tag/v1')).toBe(false);
    expect(isApkUrl(undefined)).toBe(false);
  });
});

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

  it('delegates volume and brightness to the native bridge', () => {
    const bridge = {
      getMediaVolume: vi.fn(() => 35),
      setMediaVolume: vi.fn(),
      getScreenBrightness: vi.fn(() => 60),
      setScreenBrightness: vi.fn(),
      resetScreenBrightness: vi.fn(),
    };
    vi.stubGlobal('window', { LsuNative: bridge });
    expect(hasAndroidMediaBridge()).toBe(true);
    expect(getAndroidMediaVolume()).toBe(35);
    expect(getAndroidScreenBrightness()).toBe(60);
    setAndroidMediaVolume(47.6);
    expect(bridge.setMediaVolume).toHaveBeenCalledWith(48);
    setAndroidMediaVolume(120);
    expect(bridge.setMediaVolume).toHaveBeenLastCalledWith(100);
    setAndroidScreenBrightness(0);
    expect(bridge.setScreenBrightness).toHaveBeenLastCalledWith(1);
    setAndroidScreenBrightness(88.4);
    expect(bridge.setScreenBrightness).toHaveBeenLastCalledWith(88);
    resetAndroidScreenBrightness();
    expect(bridge.resetScreenBrightness).toHaveBeenCalled();
  });

  it('opens system cast settings only when the bridge exposes it', () => {
    expect(openAndroidCastSettings()).toBe(false);
    const openCastSettings = vi.fn();
    vi.stubGlobal('window', { LsuNative: { openCastSettings } });
    expect(openAndroidCastSettings()).toBe(true);
    expect(openCastSettings).toHaveBeenCalled();
  });

  it('delegates native DLNA and Chromecast calls', () => {
    const bridge = {
      discoverDlna: vi.fn(() => true),
      castDlna: vi.fn(() => true),
      stopDlna: vi.fn(() => true),
      chromecastAvailable: vi.fn(() => true),
      castChromecast: vi.fn(() => true),
      stopChromecast: vi.fn(() => true),
    };
    vi.stubGlobal('window', { LsuNative: bridge });
    expect(discoverDlnaDevices()).toBe(true);
    expect(castDlnaDevice('tv-1', 'https://example.com/a.m3u8', '新闻')).toBe(true);
    expect(bridge.castDlna).toHaveBeenCalledWith('tv-1', 'https://example.com/a.m3u8', '新闻');
    expect(stopDlnaDevice('tv-1')).toBe(true);
    expect(hasChromecastSupport()).toBe(true);
    expect(castChromecastDevice('https://example.com/a.m3u8', '新闻')).toBe(true);
    expect(stopChromecastDevice()).toBe(true);
  });

  it('schedules and cancels Android EPG reminders through the bridge', () => {
    const scheduleEpgReminder = vi.fn(() => true);
    const cancelEpgReminder = vi.fn();
    vi.stubGlobal('window', { LsuNative: { scheduleEpgReminder, cancelEpgReminder } });
    expect(scheduleAndroidEpgReminder('id', 1_800_000_000_000, '新闻联播', 'CCTV-1')).toBe(true);
    expect(scheduleEpgReminder).toHaveBeenCalledWith('id', 1_800_000_000_000, '新闻联播', 'CCTV-1');
    cancelAndroidEpgReminder('id');
    expect(cancelEpgReminder).toHaveBeenCalledWith('id');
  });

  it('falls back when media bridge values are invalid', () => {
    vi.stubGlobal('window', { LsuNative: { getMediaVolume: () => Number.NaN, getScreenBrightness: () => Number.NaN } });
    expect(hasAndroidMediaBridge()).toBe(false);
    expect(getAndroidMediaVolume()).toBeNull();
    expect(getAndroidScreenBrightness()).toBeNull();
  });
});
