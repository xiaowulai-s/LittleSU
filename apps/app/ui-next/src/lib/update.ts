import { httpJson } from './env';
import { APP_VERSION } from './version';

export interface UpdateInfo {
  current: string;
  latest: string;
  hasUpdate: boolean;
  url: string;
}

function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map((part) => Number(part) || 0);
  const pb = b.split('.').map((part) => Number(part) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** 读取 GitHub 最新 Release 并与当前版本比较。 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const json = await httpJson('https://api.github.com/repos/xiaowulai-s/LittleSU/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' },
      timeoutSecs: 15,
    });
    const tag = String((json as { tag_name?: string }).tag_name || '');
    const latest = tag.replace(/^v/, '');
    if (!latest) return null;
    return {
      current: APP_VERSION,
      latest,
      hasUpdate: compareVersion(latest, APP_VERSION) > 0,
      url: `https://github.com/xiaowulai-s/LittleSU/releases/tag/${tag || `v${latest}`}`,
    };
  } catch {
    return null;
  }
}