interface LsuNativeBridge {
  installApk?: (url: string) => boolean;
  updatePlayback?: (
    title: string,
    subtitle: string,
    playing: boolean,
    positionSec: number,
    durationSec: number,
  ) => void;
  stopPlayback?: () => void;
  getMediaVolume?: () => number;
  setMediaVolume?: (percent: number) => void;
  getScreenBrightness?: () => number;
  setScreenBrightness?: (percent: number) => void;
  resetScreenBrightness?: () => void;
  openCastSettings?: () => void;
  scheduleEpgReminder?: (id: string, triggerAtMs: number, title: string, body: string) => boolean;
  cancelEpgReminder?: (id: string) => void;
  discoverDlna?: () => boolean;
  castDlna?: (deviceId: string, url: string, title: string) => boolean;
  stopDlna?: (deviceId: string) => boolean;
  chromecastAvailable?: () => boolean;
  castChromecast?: (url: string, title: string) => boolean;
  stopChromecast?: () => boolean;
  enterPipMode?: () => boolean;
}

function bridge(): LsuNativeBridge | null {
  if (typeof window === 'undefined') return null;
  const value = (window as unknown as { LsuNative?: LsuNativeBridge }).LsuNative;
  return value && typeof value === 'object' ? value : null;
}

/** 原生音量/亮度桥是否可用（浏览器预览和桌面端为 false）。 */
export function hasAndroidMediaBridge(): boolean {
  const native = bridge();
  return Boolean(native?.getMediaVolume && native?.setMediaVolume && native?.setScreenBrightness);
}

export function getAndroidMediaVolume(): number | null {
  try {
    const value = bridge()?.getMediaVolume?.();
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
  } catch {
    return null;
  }
}

export function setAndroidMediaVolume(percent: number): void {
  try {
    bridge()?.setMediaVolume?.(Math.round(Math.min(100, Math.max(0, percent))));
  } catch {
    /* 原生桥不可用时忽略 */
  }
}

export function getAndroidScreenBrightness(): number | null {
  try {
    const value = bridge()?.getScreenBrightness?.();
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(1, value)) : null;
  } catch {
    return null;
  }
}

export function setAndroidScreenBrightness(percent: number): void {
  try {
    bridge()?.setScreenBrightness?.(Math.round(Math.min(100, Math.max(1, percent))));
  } catch {
    /* 原生桥不可用时忽略 */
  }
}

export function resetAndroidScreenBrightness(): void {
  try {
    bridge()?.resetScreenBrightness?.();
  } catch {
    /* 原生桥不可用时忽略 */
  }
}

/** 打开系统投屏设置；Android WebView 不支持 Remote Playback 时作为入口。 */
export function openAndroidCastSettings(): boolean {
  const native = bridge();
  if (!native?.openCastSettings) return false;
  try {
    native.openCastSettings();
    return true;
  } catch {
    return false;
  }
}

/** 预约 Android 原生节目提醒；应用被系统回收后仍由 AlarmManager 触发。 */
export function scheduleAndroidEpgReminder(
  id: string,
  triggerAt: number,
  title: string,
  body: string,
): boolean {
  const native = bridge();
  if (!native?.scheduleEpgReminder) return false;
  try {
    return native.scheduleEpgReminder(id, triggerAt, title, body) === true;
  } catch {
    return false;
  }
}

export function cancelAndroidEpgReminder(id: string): void {
  try {
    bridge()?.cancelEpgReminder?.(id);
  } catch {
    /* 原生桥不可用时忽略 */
  }
}

export function discoverDlnaDevices(): boolean {
  try {
    return bridge()?.discoverDlna?.() === true;
  } catch {
    return false;
  }
}

export function castDlnaDevice(deviceId: string, url: string, title: string): boolean {
  try {
    return bridge()?.castDlna?.(deviceId, url, title) === true;
  } catch {
    return false;
  }
}

export function stopDlnaDevice(deviceId: string): boolean {
  try {
    return bridge()?.stopDlna?.(deviceId) === true;
  } catch {
    return false;
  }
}

export function hasChromecastSupport(): boolean {
  try {
    return bridge()?.chromecastAvailable?.() === true;
  } catch {
    return false;
  }
}

export function castChromecastDevice(url: string, title: string): boolean {
  try {
    return bridge()?.castChromecast?.(url, title) === true;
  } catch {
    return false;
  }
}

export function stopChromecastDevice(): boolean {
  try {
    return bridge()?.stopChromecast?.() === true;
  } catch {
    return false;
  }
}

export function hasAndroidPipSupport(): boolean {
  return Boolean(bridge()?.enterPipMode);
}

export function enterAndroidPip(): boolean {
  try {
    return bridge()?.enterPipMode?.() === true;
  } catch {
    return false;
  }
}

/** 只接受真正的 APK 地址，避免把 Release 网页当安装包下载。 */
export function isApkUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return /\.apk$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** 用 Android 原生下载器拉取 APK 并在完成后拉起系统安装器。 */
export function installAndroidApk(url: string): boolean {
  if (!isApkUrl(url)) return false;
  try {
    return bridge()?.installApk?.(url) === true;
  } catch {
    return false;
  }
}

/** 同步当前剧集、播放状态与进度到 Android 播放通知（无桥时静默忽略）。 */
export function updateAndroidPlayback(
  title: string,
  subtitle: string,
  playing: boolean,
  positionSec = 0,
  durationSec = 0,
): void {
  try {
    bridge()?.updatePlayback?.(title, subtitle, playing, positionSec, durationSec);
  } catch {
    /* 原生桥不可用时忽略 */
  }
}

export function stopAndroidPlayback(): void {
  try {
    bridge()?.stopPlayback?.();
  } catch {
    /* 原生桥不可用时忽略 */
  }
}
