import { useEffect } from 'react';

type WakeLockSentinelLike = { release: () => Promise<void> };

/** 播放期间申请屏幕常亮；页面隐藏时浏览器会自动释放，恢复可见后重新申请。 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
    };
    if (!nav.wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let disposed = false;

    const request = () => {
      if (document.visibilityState !== 'visible') return;
      nav.wakeLock?.request('screen').then((lock) => {
        if (disposed) {
          void lock.release();
          return;
        }
        sentinel = lock;
      }).catch(() => undefined);
    };

    void request();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel) {
        void sentinel.release().catch(() => undefined);
        sentinel = null;
      }
    };
  }, [active]);
}
