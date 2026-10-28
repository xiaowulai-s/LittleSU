import { clearDoubanCache } from './douban';
import { clearEpgCache } from './epg';
import { clearTitleCache } from './titleCache';

export interface CacheClearResult {
  partitions: number;
}

/** 清理内存缓存与 Cache Storage；历史、收藏与设置不受影响。 */
export async function clearAppCaches(): Promise<CacheClearResult> {
  clearTitleCache();
  clearDoubanCache();
  clearEpgCache();

  let partitions = 0;
  if (typeof caches !== 'undefined') {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      partitions = keys.length;
    } catch {
      /* Cache Storage 不可用时忽略 */
    }
  }
  return { partitions };
}
