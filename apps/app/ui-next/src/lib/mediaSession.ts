type SessionAction = 'play' | 'pause' | 'seekbackward' | 'seekforward' | 'nexttrack' | 'previoustrack' | 'stop' | 'seekto';
type SessionHandler = (details: { seekTime?: number }) => void;

export interface MediaInfo {
  title: string;
  subtitle?: string;
  poster?: string;
}

function session(): MediaSession | null {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return null;
  return navigator.mediaSession;
}

/** 设置系统媒体卡片（锁屏 / 通知栏）信息。 */
export function setMediaInfo(info: MediaInfo | null): void {
  const mediaSession = session();
  if (!mediaSession) return;
  if (!info) {
    mediaSession.metadata = null;
    return;
  }
  if (typeof MediaMetadata === 'undefined') return;
  try {
    mediaSession.metadata = new MediaMetadata({
      title: info.title,
      artist: info.subtitle || '',
      album: 'LittleSU TV',
      artwork: info.poster ? [{ src: info.poster }] : [],
    });
  } catch {
    /* 某些 WebView 不支持 MediaMetadata */
  }
}

export function setMediaHandlers(handlers: Partial<Record<SessionAction, SessionHandler | null>>): void {
  const mediaSession = session();
  if (!mediaSession) return;
  (Object.keys(handlers) as SessionAction[]).forEach((action) => {
    try {
      mediaSession.setActionHandler(action as MediaSessionAction, handlers[action] as MediaSessionActionHandler | null);
    } catch {
      /* 不支持的动作忽略 */
    }
  });
}

export function setMediaPlaybackState(state: 'none' | 'paused' | 'playing'): void {
  const mediaSession = session();
  if (!mediaSession) return;
  try {
    mediaSession.playbackState = state;
  } catch {
    /* ignore */
  }
}
