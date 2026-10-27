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