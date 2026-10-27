import { getInvoke } from './env';

async function run(command: string): Promise<boolean> {
  const invoke = getInvoke();
  if (!invoke) return false;
  try {
    await invoke(command);
    return true;
  } catch {
    return false;
  }
}

export function minimizeWindow(): Promise<boolean> {
  return run('window_minimize');
}

export function toggleMaximizeWindow(): Promise<boolean> {
  return run('window_toggle_maximize');
}

export function closeWindow(): Promise<boolean> {
  return run('window_close');
}

export async function setFullscreen(fullscreen: boolean): Promise<boolean> {
  const android = /android/i.test(navigator.userAgent);
  const invoke = getInvoke();
  if (invoke && !android) {
    try {
      await invoke('window_set_fullscreen', { fullscreen });
      return true;
    } catch {
      /* 回退到 Web Fullscreen API */
    }
  }
  try {
    if (fullscreen) {
      await document.documentElement.requestFullscreen();
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
    return true;
  } catch {
    return false;
  }
}

/** 在系统浏览器/下载器中打开链接（Tauri 内走 opener 插件）。 */
export async function openExternal(url: string): Promise<boolean> {
  const invoke = getInvoke();
  if (invoke) {
    try {
      await invoke('plugin:opener|open_url', { url });
      return true;
    } catch {
      /* 回退到 window.open */
    }
  }
  window.open(url, '_blank', 'noopener');
  return false;
}