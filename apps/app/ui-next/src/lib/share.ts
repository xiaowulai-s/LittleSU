export interface SharePayload {
  title: string;
  text?: string;
  url?: string;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 回退到 execCommand */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** 优先系统分享面板，其次复制标题/简介/链接，均不可用返回失败。 */
export async function shareContent(payload: SharePayload): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: payload.title,
        text: payload.text,
        url: payload.url,
      });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared';
    }
  }
  const content = [payload.title, payload.text, payload.url].filter(Boolean).join('\n');
  return (await copyText(content)) ? 'copied' : 'failed';
}

export const CLIENT_RELEASE_URL = 'https://github.com/xiaowulai-s/LittleSU/releases/latest';
