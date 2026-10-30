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
}

function bridge(): LsuNativeBridge | null {
  if (typeof window === 'undefined') return null;
  const value = (window as unknown as { LsuNative?: LsuNativeBridge }).LsuNative;
  return value && typeof value === 'object' ? value : null;
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
