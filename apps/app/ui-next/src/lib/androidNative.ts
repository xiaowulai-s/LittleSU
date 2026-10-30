interface LsuNativeBridge {
  installApk?: (url: string) => boolean;
  updatePlayback?: (title: string, subtitle: string, playing: boolean) => void;
  stopPlayback?: () => void;
}

function bridge(): LsuNativeBridge | null {
  if (typeof window === 'undefined') return null;
  const value = (window as unknown as { LsuNative?: LsuNativeBridge }).LsuNative;
  return value && typeof value === 'object' ? value : null;
}

/** 用 Android 原生下载器拉取 APK 并在完成后拉起系统安装器。 */
export function installAndroidApk(url: string): boolean {
  if (!url) return false;
  try {
    return bridge()?.installApk?.(url) === true;
  } catch {
    return false;
  }
}

/** 同步当前剧集与播放状态到 Android 播放通知（无桥时静默忽略）。 */
export function updateAndroidPlayback(title: string, subtitle: string, playing: boolean): void {
  try {
    bridge()?.updatePlayback?.(title, subtitle, playing);
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
