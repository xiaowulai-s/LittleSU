import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, TouchEvent as ReactTouchEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Hls from 'hls.js';
import type { Episode, Title } from '../data';
import { Icon } from '../icons';
import { useApp } from '../store';
import { historyToTitle } from '../lib/adapters';
import { stopAndroidPlayback, updateAndroidPlayback } from '../lib/androidNative';
import { refreshTitleDetail, useDetail } from '../lib/hooks';
import { isExpiredStreamError, selectRefreshedEpisode } from '../lib/playbackRefresh';
import { hlsConfigWithNativeLoader } from '../lib/hlsNativeLoader';
import { clampBrightness, clampVolume, gestureRatio } from '../lib/gesture';
import { pickQualityLevel, qualityLabel } from '../lib/quality';
import { useWakeLock } from '../lib/wakeLock';
import { setMediaHandlers, setMediaInfo, setMediaPlaybackState } from '../lib/mediaSession';
import { CLIENT_RELEASE_URL, shareContent } from '../lib/share';
import { normalizeSubtitle } from '../lib/subtitles';
import { mergeEpisodeProgress, resumePositionFor } from '../lib/progress';
import type { EpisodeProgress } from '../lib/storage';
import { httpText, isTauri } from '../lib/env';
import { setFullscreen } from '../lib/window';
import { Button, Chip, Rating } from '../ui';

const speeds = [1, 1.25, 1.5, 2];

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function mockEpisodes(title: Title): Episode[] {
  if (title.type === '电影') return [{ name: '正片', url: '' }];
  return Array.from({ length: Math.min(title.episodes || 24, 24) }, (_, index) => ({
    name: `第 ${index + 1} 集`,
    url: '',
  }));
}

export default function Player() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    favoriteKeys,
    toggleFavorite,
    toast,
    getTitle,
    history,
    recordHistory,
    settings,
    updateSettings,
    customApis,
    device,
  } = useApp();
  const rawKey = id ? decodeURIComponent(id) : '';

  const baseTitle: Title | undefined = useMemo(() => {
    const cached = getTitle(rawKey);
    if (cached) return cached;
    const record = history.find((item) => item.key === rawKey);
    return record ? historyToTitle(record) : undefined;
  }, [rawKey, getTitle, history]);

  const historyRecord = history.find((item) => item.key === rawKey);
  const [activeTitle, setActiveTitle] = useState<Title | undefined>(baseTitle);
  const triedRef = useRef<Set<string>>(new Set());
  const [switching, setSwitching] = useState(false);
  const { title: detailed, loading: detailLoading } = useDetail(activeTitle);
  const title = detailed ?? activeTitle;

  const [lineIndex, setLineIndex] = useState(() => baseTitle?.playLineIndex ?? 0);
  const episodes = useMemo<Episode[]>(() => {
    if (!title) return [];
    if (title.playLines?.length) {
      return title.playLines[lineIndex]?.episodes ?? title.playLines[0]?.episodes ?? [];
    }
    if (title.episodesList?.length) return title.episodesList;
    if (title.playUrl) return [{ name: '正片', url: title.playUrl }];
    return mockEpisodes(title);
  }, [title, lineIndex]);
  const lineName = title?.playLines?.[lineIndex]?.name;

  const [episode, setEpisode] = useState(() => (historyRecord?.episodeIndex ?? 0) + 1);
  const progressMapRef = useRef<Record<string, EpisodeProgress>>(historyRecord?.episodeProgress ?? {});
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(() => {
    const index = speeds.indexOf(settings.speed);
    return index >= 0 ? index : 0;
  });
  const [videoError, setVideoError] = useState<string | null>(null);
  const [playableUrl, setPlayableUrl] = useState('');
  const [resolving, setResolving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [levels, setLevels] = useState<{ index: number; label: string; height?: number }[]>([]);
  const [qualityIndex, setQualityIndex] = useState(-1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreenState] = useState(false);
  const [cssFullscreen, setCssFullscreen] = useState(false);
  const [portrait, setPortrait] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(orientation: portrait)').matches : false,
  );
  const [locked, setLocked] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>(settings.fitMode);
  const [brightness, setBrightness] = useState(1);
  const [gestureHud, setGestureHud] = useState<{ kind: 'brightness' | 'volume'; value: number } | null>(null);
  const [subtitleTracks, setSubtitleTracks] = useState<{ id: number; label: string }[]>([]);
  const [audioTracks, setAudioTracks] = useState<{ id: number; label: string }[]>([]);
  const [subtitleId, setSubtitleId] = useState(-1);
  const [localSubtitle, setLocalSubtitle] = useState<{ name: string; vtt: string } | null>(null);
  const [audioId, setAudioId] = useState(0);
  const [pipSupported, setPipSupported] = useState(false);
  const castSupported = typeof HTMLVideoElement !== 'undefined' && 'remote' in HTMLVideoElement.prototype;
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const subtitleTrackRef = useRef<HTMLTrackElement | null>(null);
  const subtitleUrlRef = useRef<string | null>(null);
  const hudTimer = useRef<number | null>(null);
  const gestureRef = useRef<{ kind: 'brightness' | 'volume'; startY: number; startValue: number } | null>(null);
  const triedNextRef = useRef<(reason: string) => boolean>(() => false);
  const fullscreenRef = useRef<() => void>(() => undefined);
  const settingsRef = useRef(settings);
  const preferredHeightRef = useRef<number | null>(null);
  const mediaControlsRef = useRef<{ skipBy: (seconds: number) => void; next: () => void; hasNext: boolean }>({
    skipBy: () => undefined,
    next: () => undefined,
    hasNext: false,
  });

  const current = episodes[episode - 1];
  const sourceUrl = current?.url || '';
  const streamUrl = playableUrl || (/\.m3u8/i.test(sourceUrl) ? sourceUrl : '');
  const isMock = !streamUrl && !resolving;
  const isFavorite = favoriteKeys.has(rawKey);
  const key = rawKey;
  const rotateLandscape = device === 'android' && cssFullscreen && portrait;
  const sourceUrlRef = useRef(sourceUrl);
  sourceUrlRef.current = sourceUrl;
  const freshAutoRef = useRef(false);
  const refreshingRef = useRef(false);
  const mountedRef = useRef(true);
  const refreshRef = useRef<(requireChange: boolean) => Promise<boolean>>(async () => false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(orientation: portrait)');
    const onChange = (event: MediaQueryListEvent) => setPortrait(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  /* 优先请求系统横屏；WebView 不支持时由 CSS 旋转兜底 */
  useEffect(() => {
    if (device !== 'android' || !cssFullscreen) return;
    const orientation = window.screen?.orientation as unknown as { lock?: (mode: string) => Promise<void>; unlock?: () => void } | undefined;
    void orientation?.lock?.('landscape').catch(() => undefined);
    return () => { orientation?.unlock?.(); };
  }, [device, cssFullscreen]);

  const uniqueVariants = useMemo(() => {
    const map = new Map<string, { sourceKey: string; sourceName: string; vodId: string; playable: number }>();
    (title?.variants || []).forEach((variant) => {
      map.set(`${variant.sourceKey}:${variant.vodId}`, variant);
    });
    return Array.from(map.values());
  }, [title?.variants]);

  /* ---------- 路由切换时重置 ---------- */
  useEffect(() => {
    setActiveTitle(baseTitle);
    triedRef.current = new Set();
    setSwitching(false);
    setVideoError(null);
    setPlayableUrl('');
    setProgress(0);
    setCurrentTime(0);
    setEpisode((historyRecord?.episodeIndex ?? 0) + 1);
    setLineIndex(baseTitle?.playLineIndex ?? 0);
    progressMapRef.current = historyRecord?.episodeProgress ?? {};
    preferredHeightRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawKey]);

  /* 每条地址/线路/剧集只自动尝试一次刷新，避免签名地址持续失效时循环 */
  useEffect(() => {
    freshAutoRef.current = false;
  }, [title?.key, lineIndex, episode]);

  /* ---------- 播放失败自动换源 ---------- */
  const tryNextVariant = useCallback((reason: string): boolean => {
    if (!title || !settings.autoSwitchSource) return false;
    const currentKey = title.key ?? title.id;
    const next = uniqueVariants.find((variant) => {
      const variantKey = `${variant.sourceKey}:${variant.vodId}`;
      return variantKey !== currentKey && !triedRef.current.has(variantKey);
    });
    if (!next) return false;
    const nextKey = `${next.sourceKey}:${next.vodId}`;
    triedRef.current.add(currentKey);
    triedRef.current.add(nextKey);
    setSwitching(true);
    setVideoError(`播放失败（${reason}），正在切换到 ${next.sourceName}…`);
    setActiveTitle({
      ...title,
      key: nextKey,
      id: nextKey,
      source: next.sourceName,
      sourceKey: next.sourceKey,
      vodId: next.vodId,
      episodesList: undefined,
      playUrl: undefined,
    });
    setEpisode(1);
    setLineIndex(0);
    setProgress(0);
    setCurrentTime(0);
    setPlaying(true);
    toast(`已自动切换到 ${next.sourceName}`, 'success');
    window.setTimeout(() => setSwitching(false), 1500);
    return true;
  }, [title, uniqueVariants, settings.autoSwitchSource, toast]);

  /**
   * 重新拉取详情换取新的播放地址。签名 m3u8 过期时同一个 URL 永远失败，
   * 重试必须先回源刷新；requireChange 为 false 时允许地址未变化也重载。
   */
  const refreshCurrentEpisode = useCallback(async (requireChange: boolean): Promise<boolean> => {
    const base = title;
    if (!isTauri() || !base?.sourceKey || !base.vodId || refreshingRef.current) return false;
    const expectedUrl = sourceUrlRef.current;
    refreshingRef.current = true;
    try {
      const fresh = await refreshTitleDetail(base, customApis);
      if (!fresh || !mountedRef.current || sourceUrlRef.current !== expectedUrl) return false;
      const picked = selectRefreshedEpisode(fresh, {
        lineIndex,
        lineName: base.playLines?.[lineIndex]?.name,
        episodeIndex: episode - 1,
        episodeName: current?.name,
      });
      if (!picked) return false;
      if (requireChange && picked.url === expectedUrl) return false;
      setActiveTitle({ ...fresh, playLineIndex: picked.lineIndex });
      setLineIndex(picked.lineIndex);
      setEpisode(picked.episodeIndex + 1);
      setPlayableUrl('');
      setVideoError(null);
      setReloadKey((value) => value + 1);
      return true;
    } catch {
      return false;
    } finally {
      refreshingRef.current = false;
    }
  }, [title, customApis, lineIndex, episode, current]);

  useEffect(() => {
    triedNextRef.current = tryNextVariant;
  }, [tryNextVariant]);

  useEffect(() => {
    refreshRef.current = refreshCurrentEpisode;
  }, [refreshCurrentEpisode]);

  /* ---------- 分享页 -> m3u8 解析 ---------- */
  useEffect(() => {
    let cancelled = false;
    setPlayableUrl('');
    if (!sourceUrl) return;
    if (/\.m3u8/i.test(sourceUrl)) {
      setPlayableUrl(sourceUrl);
      return;
    }
    if (!isTauri()) {
      setPlayableUrl(sourceUrl);
      return;
    }
    setResolving(true);
    httpText(sourceUrl, { timeoutSecs: 20 })
      .then((html) => {
        if (cancelled) return;
        const absolute = html.match(/https?:\/\/[^"'\s]+?\.m3u8[^"'\s]*/);
        if (absolute) {
          setPlayableUrl(absolute[0]);
          return;
        }
        const relative = html.match(/["'](\/[^"']*?\.m3u8[^"']*)["']/);
        if (relative) {
          try {
            setPlayableUrl(new URL(relative[1], new URL(sourceUrl).origin).href);
            return;
          } catch {
            /* 忽略解析失败 */
          }
        }
        setPlayableUrl(sourceUrl);
      })
      .catch(() => { if (!cancelled) setPlayableUrl(sourceUrl); })
      .finally(() => { if (!cancelled) setResolving(false); });
    return () => { cancelled = true; };
  }, [sourceUrl]);

  /* ---------- HLS 初始化（含广告过滤） ---------- */
  useEffect(() => {
    const video = videoRef.current;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (!video) return;
    setVideoError(null);
    if (!streamUrl) {
      video.removeAttribute('src');
      setPlaying(!resolving);
      return;
    }

    setSubtitleTracks([]);
    setAudioTracks([]);
    setSubtitleId(-1);
    setAudioId(0);
    setLevels([]);
    setQualityIndex(-1);
    setLocked(false);
    if (Hls.isSupported()) {
      const hls = new Hls(hlsConfigWithNativeLoader(settings.adFilter));
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      const syncTracks = () => {
        setSubtitleTracks(
          (hls.subtitleTracks || []).map((track, index) => ({
            id: index,
            label: track.name || track.lang || `字幕 ${index + 1}`,
          })),
        );
        setAudioTracks(
          (hls.audioTracks || []).map((track, index) => ({
            id: index,
            label: track.name || track.lang || `音轨 ${index + 1}`,
          })),
        );
        setSubtitleId(hls.subtitleTrack ?? -1);
        setAudioId(hls.audioTrack ?? 0);
      };
      const syncLevels = () => {
        const list = (hls.levels || []).map((level, index) => ({
          index,
          label: qualityLabel(level, index),
          height: level.height || undefined,
        }));
        setLevels(list);
        const preferred = preferredHeightRef.current !== null
          ? preferredHeightRef.current
          : settingsRef.current.quality === '4K'
            ? 2160
            : settingsRef.current.quality === '1080P'
              ? 1080
              : 0;
        const target = pickQualityLevel(hls.levels || [], preferred);
        hls.currentLevel = target;
        setQualityIndex(target);
      };
      hls.on(Hls.Events.MANIFEST_PARSED, syncTracks);
      hls.on(Hls.Events.MANIFEST_PARSED, syncLevels);
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, syncTracks);
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, syncTracks);
      hls.on(Hls.Events.LEVEL_SWITCHED, () => {
        setQualityIndex(hls.autoLevelEnabled ? -1 : hls.currentLevel);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data?.fatal) return;
        const reason = data.details || '播放失败';
        const expectedUrl = sourceUrlRef.current;
        const response = (data as { response?: { code?: number } }).response;
        if (!freshAutoRef.current && isExpiredStreamError(reason, response?.code)) {
          freshAutoRef.current = true;
          void refreshRef.current(true).then((refreshed) => {
            if (refreshed) {
              toast('播放地址已刷新', 'success');
              return;
            }
            if (sourceUrlRef.current !== expectedUrl) return;
            const handled = triedNextRef.current(reason);
            if (!handled) setVideoError(reason);
          });
          return;
        }
        const handled = triedNextRef.current(reason);
        if (!handled) setVideoError(reason);
      });
      hlsRef.current = hls;
    } else {
      video.src = streamUrl;
    }
    video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, settings.adFilter, resolving, reloadKey]);

  /* ---------- 音量 ---------- */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = muted ? 0 : settings.volume;
    video.muted = muted;
  }, [streamUrl, settings.volume, muted]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  /* 记住倍速 */
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = speeds[speedIndex];
  }, [streamUrl, speedIndex]);

  useWakeLock(settings.keepAwake && playing && !isMock);

  /* 系统媒体卡片（锁屏 / 通知栏） */
  useEffect(() => {
    if (!title) return;
    setMediaInfo({
      title: title.name,
      subtitle: [current?.name, title.source].filter(Boolean).join(' · '),
      poster: title.poster,
    });
    setMediaHandlers({
      play: () => { void videoRef.current?.play(); },
      pause: () => { videoRef.current?.pause(); },
      seekbackward: () => mediaControlsRef.current.skipBy(-10),
      seekforward: () => mediaControlsRef.current.skipBy(10),
      seekto: (details) => {
        const video = videoRef.current;
        if (video && typeof details.seekTime === 'number') video.currentTime = details.seekTime;
      },
      nexttrack: () => {
        if (mediaControlsRef.current.hasNext) mediaControlsRef.current.next();
      },
    });
    return () => {
      setMediaHandlers({
        play: null,
        pause: null,
        seekbackward: null,
        seekforward: null,
        seekto: null,
        nexttrack: null,
      });
      setMediaInfo(null);
    };
  }, [title?.name, title?.source, title?.poster, current?.name]);

  useEffect(() => {
    setMediaPlaybackState(playing ? 'playing' : 'paused');
  }, [playing]);

  /* Android 前台服务：后台播放、播放通知与进度 */
  useEffect(() => {
    if (device !== 'android' || !isTauri() || !title || isMock) return;
    const send = () => {
      const video = videoRef.current;
      const position = video && Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const duration = video && Number.isFinite(video.duration) ? video.duration : 0;
      updateAndroidPlayback(title.name, current?.name || '', playing, position, duration);
    };
    send();
    if (!playing) return;
    const timer = window.setInterval(send, 2000);
    return () => window.clearInterval(timer);
  }, [device, title, current?.name, playing, isMock]);

  useEffect(() => {
    if (device !== 'android' || !isTauri()) return;
    return () => stopAndroidPlayback();
  }, [device]);

  useEffect(() => {
    setPipSupported(typeof document !== 'undefined' && document.pictureInPictureEnabled === true);
  }, []);

  /* 原生播放（无 hls.js）时从 video.textTracks 读取字幕轨 */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      if (hlsRef.current) return;
      setSubtitleTracks(
        Array.from(video.textTracks).map((track, index) => ({
          id: index,
          label: track.label || track.language || `字幕 ${index + 1}`,
        })),
      );
    };
    video.addEventListener('loadedmetadata', sync);
    return () => video.removeEventListener('loadedmetadata', sync);
  }, [streamUrl]);

  /* 本地 SRT/VTT 字幕：转成 WebVTT 后挂到 video 上 */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !localSubtitle) return;
    const url = URL.createObjectURL(new Blob([localSubtitle.vtt], { type: 'text/vtt' }));
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = localSubtitle.name;
    track.srclang = 'zh';
    track.default = true;
    track.src = url;
    video.appendChild(track);
    subtitleTrackRef.current = track;
    subtitleUrlRef.current = url;
    const enable = () => {
      Array.from(video.textTracks).forEach((item) => {
        item.mode = item.label === localSubtitle.name ? 'showing' : 'disabled';
      });
    };
    track.addEventListener('load', enable);
    enable();
    return () => {
      track.removeEventListener('load', enable);
      track.remove();
      URL.revokeObjectURL(url);
      if (subtitleTrackRef.current === track) subtitleTrackRef.current = null;
      if (subtitleUrlRef.current === url) subtitleUrlRef.current = null;
    };
  }, [localSubtitle, streamUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl || !settings.remember) return;
    const episodeName = current?.name || '正片';
    const sameEpisode = !historyRecord?.episodeName || historyRecord.episodeName === episodeName;
    const fallback = sameEpisode ? historyRecord?.position ?? 0 : 0;
    const resumeAt = resumePositionFor(progressMapRef.current, episodeName, fallback);
    if (resumeAt <= 0) return;
    const onLoaded = () => {
      video.currentTime = Math.min(resumeAt, video.duration || resumeAt);
      toast(`已恢复到 ${formatTime(resumeAt)}`, 'success');
    };
    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    return () => video.removeEventListener('loadedmetadata', onLoaded);
  }, [streamUrl, settings.remember, current?.name, historyRecord?.episodeName, historyRecord?.position, toast]);

  const persistHistory = useCallback(() => {
    if (!title) return;
    const video = videoRef.current;
    const position = isMock ? currentTime : video?.currentTime ?? 0;
    const total = isMock ? (title.type === '电影' ? 7200 : 2700) : video?.duration ?? 0;
    const progress = total > 0 ? Math.min(100, Math.round((position / total) * 100)) : 0;
    const episodeName = current?.name || '正片';
    progressMapRef.current = mergeEpisodeProgress(progressMapRef.current, episodeName, {
      position,
      duration: total,
      progress,
    });
    recordHistory({
      key,
      name: title.name,
      poster: title.poster,
      sourceName: title.source,
      sourceKey: title.sourceKey,
      vodId: title.vodId,
      playUrl: streamUrl || title.playUrl,
      episodeName,
      episodeIndex: episode - 1,
      position,
      duration: total,
      timestamp: Date.now(),
      progress,
      episodeProgress: progressMapRef.current,
    });
  }, [title, isMock, currentTime, recordHistory, key, streamUrl, current?.name, episode]);

  useEffect(() => {
    persistHistory();
  }, [streamUrl, persistHistory]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(persistHistory, 10000);
    return () => window.clearInterval(timer);
  }, [playing, persistHistory]);

  useEffect(() => {
    if (!isMock || !playing) return;
    const timer = window.setInterval(() => {
      setCurrentTime((value) => value + 1);
      setProgress((value) => (value >= 100 ? 0 : value + 0.4));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isMock, playing]);

  /* ---------- 全屏 ---------- */
  const toggleFullscreen = useCallback(async () => {
    const next = !fullscreen;
    if (!next) {
      setLocked(false);
      setSheetOpen(false);
    }
    if (device === 'android') {
      setCssFullscreen(next);
      setFullscreenState(next);
      if (next && portrait) toast('已横向铺满，请旋转手机观看', 'success');
      return;
    }
    const ok = await setFullscreen(next);
    if (!ok) toast('已切换为页面内全屏', 'success');
    setCssFullscreen(next);
    setFullscreenState(next);
  }, [fullscreen, device, toast]);

  useEffect(() => {
    fullscreenRef.current = () => { void toggleFullscreen(); };
  }, [toggleFullscreen]);

  useEffect(() => () => {
    if (fullscreen) void setFullscreen(false);
  }, [fullscreen]);

  /* Android 返回键：锁屏/全屏时先退出对应状态，由 App 的返回处理派发 lsu:back */
  useEffect(() => {
    const onBack = (event: Event) => {
      if (locked) {
        event.preventDefault();
        setLocked(false);
        return;
      }
      if (!cssFullscreen) return;
      event.preventDefault();
      setCssFullscreen(false);
      setFullscreenState(false);
      if (device !== 'android') void setFullscreen(false);
    };
    window.addEventListener('lsu:back', onBack);
    return () => window.removeEventListener('lsu:back', onBack);
  }, [cssFullscreen, locked, device]);

  const flashHud = (kind: 'brightness' | 'volume', value: number) => {
    setGestureHud({ kind, value });
    if (hudTimer.current) window.clearTimeout(hudTimer.current);
    hudTimer.current = window.setTimeout(() => setGestureHud(null), 700);
  };

  /* ---------- 键盘快捷键 ---------- */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        const video = videoRef.current;
        if (!isMock && video) {
          if (video.paused) video.play().then(() => setPlaying(true)).catch(() => undefined);
          else { video.pause(); setPlaying(false); }
        } else {
          setPlaying((value) => !value);
        }
      }
      if (event.key === 'ArrowRight') {
        const video = videoRef.current;
        if (!isMock && video) video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
        else setProgress((value) => Math.min(100, value + 5));
      }
      if (event.key === 'ArrowLeft') {
        const video = videoRef.current;
        if (!isMock && video) video.currentTime = Math.max(0, video.currentTime - 10);
        else setProgress((value) => Math.max(0, value - 5));
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        const delta = event.key === 'ArrowUp' ? 0.1 : -0.1;
        const value = Math.max(0, Math.min(1, Math.round((settings.volume + delta) * 10) / 10));
        updateSettings({ volume: value });
        setMuted(value === 0);
        flashHud('volume', value);
      }
      if (event.key.toLowerCase() === 'm') setMuted((value) => !value);
      if (event.key.toLowerCase() === 'f') fullscreenRef.current();
      if (event.key === 'Escape') {
        if (locked) setLocked(false);
        else if (fullscreen) fullscreenRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMock, fullscreen, locked, settings.volume, updateSettings]);

  /* 系统播放通知的暂停/继续/停止动作 */
  useEffect(() => {
    if (device !== 'android') return;
    const onNativeMedia = (event: Event) => {
      const detail = (event as CustomEvent<string | { action?: string; position?: number }>).detail;
      const action = typeof detail === 'string' ? detail : detail?.action;
      const position = typeof detail === 'object' ? detail?.position : undefined;
      const video = videoRef.current;
      if (action === 'play') {
        void video?.play();
      } else if (action === 'pause') {
        video?.pause();
      } else if (action === 'toggle') {
        if (!isMock && video) {
          if (video.paused) void video.play();
          else video.pause();
        } else {
          setPlaying((value) => !value);
        }
      } else if (action === 'seek' && typeof position === 'number' && Number.isFinite(position)) {
        if (video) video.currentTime = Math.max(0, position / 1000);
      } else if (action === 'stop') {
        video?.pause();
        stopAndroidPlayback();
      }
    };
    window.addEventListener('lsu:native-media', onNativeMedia);
    return () => window.removeEventListener('lsu:native-media', onNativeMedia);
  }, [device, isMock]);

  if (!title) {
    return (
      <div className="player-page player-empty">
        <p>没有找到这个内容。</p>
        <Button variant="primary" onClick={() => navigate('/')}>返回首页</Button>
      </div>
    );
  }

  const togglePlay = () => {
    const video = videoRef.current;
    if (!isMock && video) {
      if (video.paused) video.play().then(() => setPlaying(true)).catch(() => undefined);
      else { video.pause(); setPlaying(false); }
    } else {
      setPlaying((value) => !value);
    }
  };

  const seek = (value: number) => {
    setProgress(value);
    const video = videoRef.current;
    if (!isMock && video && video.duration) video.currentTime = (value / 100) * video.duration;
  };

  const skipBy = (seconds: number) => {
    const video = videoRef.current;
    if (!isMock && video && Number.isFinite(video.duration)) {
      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
      return;
    }
    // 演示模式按每秒 0.4% 估算
    setProgress((value) => Math.max(0, Math.min(100, value + seconds * 0.4)));
  };

  const selectSubtitle = (id: number) => {
    if (subtitleTrackRef.current) subtitleTrackRef.current.track.mode = 'disabled';
    const hls = hlsRef.current;
    if (hls) {
      hls.subtitleTrack = id;
      hls.subtitleDisplay = id >= 0;
    } else {
      const video = videoRef.current;
      if (video) {
        Array.from(video.textTracks).forEach((track, index) => {
          track.mode = index === id ? 'showing' : 'disabled';
        });
      }
    }
    setSubtitleId(id);
  };

  const selectLocalSubtitle = () => {
    if (!localSubtitle) return;
    const hls = hlsRef.current;
    if (hls) {
      hls.subtitleTrack = -1;
      hls.subtitleDisplay = false;
    }
    const video = videoRef.current;
    if (video) {
      Array.from(video.textTracks).forEach((track) => {
        track.mode = track.label === localSubtitle.name ? 'showing' : 'disabled';
      });
    }
    setSubtitleId(-2);
  };

  const handleSubtitleFile = async (file: File) => {
    try {
      const vtt = normalizeSubtitle(await file.text());
      if (!vtt.replace(/^WEBVTT\s*/i, '').trim()) {
        toast('字幕内容为空', 'warning');
        return;
      }
      setLocalSubtitle({ name: file.name.replace(/\.[^.]+$/, ''), vtt });
      setSubtitleId(-2);
      toast(`已加载字幕 ${file.name}`, 'success');
    } catch {
      toast('字幕读取失败', 'warning');
    }
  };

  const removeLocalSubtitle = () => {
    setLocalSubtitle(null);
    setSubtitleId(-1);
    toast('已移除本地字幕', 'success');
  };

  const selectAudio = (id: number) => {
    if (hlsRef.current) hlsRef.current.audioTrack = id;
    setAudioId(id);
  };

  const togglePip = async () => {
    const video = videoRef.current;
    if (!video || !pipSupported) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      toast('当前环境不支持画中画', 'warning');
    }
  };

  const onSurfaceTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (!cssFullscreen || locked || sheetOpen || rotateLandscape) return;
    const target = event.target as HTMLElement;
    if (target.closest('.video-controls, .player-sheet-layer, .player-unlock')) return;
    const touch = event.touches[0];
    if (!touch) return;
    const left = touch.clientX < window.innerWidth / 2;
    gestureRef.current = {
      kind: left ? 'brightness' : 'volume',
      startY: touch.clientY,
      startValue: left ? brightness : (videoRef.current?.volume ?? settings.volume),
    };
  };

  const onSurfaceTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    const touch = event.touches[0];
    if (!gesture || !touch) return;
    const delta = gestureRatio(gesture.startY, touch.clientY, window.innerHeight);
    if (gesture.kind === 'brightness') {
      const value = clampBrightness(gesture.startValue + delta * 1.3);
      setBrightness(value);
      flashHud('brightness', value);
      return;
    }
    const value = clampVolume(gesture.startValue + delta);
    const video = videoRef.current;
    if (video) {
      video.volume = value;
      video.muted = value === 0;
    }
    setMuted(value === 0);
    flashHud('volume', value);
  };

  const onSurfaceTouchEnd = () => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (gesture?.kind === 'volume') {
      updateSettings({ volume: videoRef.current?.volume ?? settings.volume });
    }
  };

  const lockScreen = () => {
    setLocked(true);
    setSheetOpen(false);
  };

  const switchEpisode = (index: number) => {
    persistHistory();
    setEpisode(index + 1);
    setCurrentTime(0);
    setProgress(0);
    setPlaying(true);
    toast(`正在播放 ${episodes[index]?.name || `第 ${index + 1} 集`}`);
  };

  const switchLine = (index: number) => {
    if (!title?.playLines?.[index]) return;
    persistHistory();
    setLineIndex(index);
    setEpisode(1);
    setCurrentTime(0);
    setProgress(0);
    setPlaying(true);
    setVideoError(null);
    setSheetOpen(false);
    toast(`已切换到线路 ${title.playLines[index].name}`, 'success');
  };

  const switchToVariant = (variant: { sourceKey: string; sourceName: string; vodId: string }) => {
    if (!title) return;
    persistHistory();
    const nextKey = `${variant.sourceKey}:${variant.vodId}`;
    triedRef.current.add(title.key ?? title.id);
    setActiveTitle({
      ...title,
      key: nextKey,
      id: nextKey,
      source: variant.sourceName,
      sourceKey: variant.sourceKey,
      vodId: variant.vodId,
      episodesList: undefined,
      playUrl: undefined,
    });
    setEpisode(1);
    setLineIndex(0);
    setProgress(0);
    setCurrentTime(0);
    setPlaying(true);
    setVideoError(null);
    toast(`已切换到 ${variant.sourceName}`, 'success');
  };

  mediaControlsRef.current = {
    skipBy,
    next: () => { if (episode < episodes.length) switchEpisode(episode); },
    hasNext: episode < episodes.length,
  };

  const selectQuality = (index: number) => {
    const hls = hlsRef.current;
    if (!hls) {
      toast('当前播放内核不支持清晰度切换', 'warning');
      return;
    }
    hls.currentLevel = index;
    setQualityIndex(index);
    preferredHeightRef.current = index < 0 ? 0 : (hls.levels[index]?.height || 0);
    const label = index < 0 ? '自动' : levels.find((level) => level.index === index)?.label || `线路 ${index + 1}`;
    toast(`清晰度：${label}`, 'success');
  };

  const retryPlayback = async () => {
    setVideoError(null);
    triedRef.current = new Set();
    freshAutoRef.current = true;
    const expectedUrl = sourceUrlRef.current;
    toast('正在重新获取播放地址…');
    const refreshed = await refreshRef.current(false);
    if (refreshed) {
      toast('播放地址已刷新', 'success');
      return;
    }
    if (!mountedRef.current || sourceUrlRef.current !== expectedUrl) return;
    setReloadKey((value) => value + 1);
    toast('正在重新加载', 'success');
  };

  const changeFit = (mode: 'contain' | 'cover') => {
    setFitMode(mode);
    updateSettings({ fitMode: mode });
  };

  const cycleSpeed = () => {
    const next = (speedIndex + 1) % speeds.length;
    setSpeedIndex(next);
    updateSettings({ speed: speeds[next] });
    if (videoRef.current) videoRef.current.playbackRate = speeds[next];
  };

  const totalSeconds = isMock ? (title.type === '电影' ? 7200 : 2700) : duration;
  const displayTime = isMock ? currentTime : progress > 0 ? (progress / 100) * duration : 0;
  const activeVariantKey = `${title.sourceKey || ''}:${title.vodId || ''}`;
  const statusText = switching || detailLoading ? '切换源中…' : isMock ? '演示播放' : '原生取流';

  return (
    <div className={`player-page ${cssFullscreen ? 'is-css-fullscreen' : ''} ${rotateLandscape ? 'is-landscape-rotate' : ''}`}>
      <header className="player-topbar">
        <button type="button" className="player-back" onClick={() => navigate(-1)} aria-label="返回">
          <Icon name="back" size={19} />
        </button>
        <div className="player-topbar-title">
          <strong>{title.name}</strong>
          <span>{current?.name || '正片'} · {title.source}{lineName ? ` · ${lineName}` : ''} · {title.quality} · {statusText}</span>
        </div>
        <div className="player-topbar-actions">
          <Chip>{title.quality}</Chip>
          <button type="button" className="icon-btn" aria-label="更多" onClick={() => toast(isMock ? '演示模式：未获取到播放地址' : '当前播放地址已就绪')}>
            <Icon name="more" size={18} />
          </button>
        </div>
      </header>

      <div className="player-body">
        <div className="player-main">
          <div
            className={`video-surface ${locked ? 'is-locked' : ''}`}
            style={{ '--h': title.hue } as CSSProperties}
            onTouchStart={onSurfaceTouchStart}
            onTouchMove={onSurfaceTouchMove}
            onTouchEnd={onSurfaceTouchEnd}
          >
            <div className="video-bg" />
            <div className="video-glow" />
            <div className="video-grain" />
            <video
              ref={videoRef}
              className={`video-el ${isMock ? 'is-hidden' : ''}`}
              playsInline
              onError={() => { if (!hlsRef.current) setVideoError('视频加载失败'); }}
              style={{
                objectFit: fitMode,
                filter: brightness !== 1 ? `brightness(${brightness})` : undefined,
              }}
              onTimeUpdate={(event) => {
                const video = event.currentTarget;
                setCurrentTime(video.currentTime);
                setDuration(video.duration || 0);
                setProgress(video.duration ? (video.currentTime / video.duration) * 100 : 0);
              }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                persistHistory();
                if (settings.autoNext && episode < episodes.length) switchEpisode(episode);
                else setPlaying(false);
              }}
            />
            {isMock && (
              <>
                <div className="video-watermark">{title.name.slice(0, 1)}</div>
                <div className="video-center">
                  <span className="video-kicker"><i className="live-dot" />{current?.name || '正片'} · 演示播放</span>
                  <h2>{title.name}</h2>
                  <p>{title.en || title.genres.join(' / ')}</p>
                  <button type="button" className="video-play-big" onClick={togglePlay} aria-label={playing ? '暂停' : '播放'}>
                    <Icon name={playing ? 'pause' : 'play'} size={34} />
                  </button>
                </div>
              </>
            )}
            {!isMock && !playing && (
              <button type="button" className="video-play-big video-play-overlay" onClick={togglePlay} aria-label="播放">
                <Icon name="play" size={34} />
              </button>
            )}
            {videoError && (
              <div className="video-error">
                <span>{videoError}</span>
                <button type="button" onClick={retryPlayback}>重试</button>
              </div>
            )}
            <div className="video-controls">
              <button type="button" onClick={togglePlay} aria-label={playing ? '暂停' : '播放'}>
                <Icon name={playing ? 'pause' : 'play'} size={19} />
              </button>
              <button type="button" onClick={() => skipBy(-10)} aria-label="后退 10 秒">
                <Icon name="rewind10" size={18} />
              </button>
              <button type="button" onClick={() => skipBy(10)} aria-label="前进 10 秒">
                <Icon name="forward10" size={18} />
              </button>
              <span className="video-time">{formatTime(displayTime)}</span>
              <input
                className="video-progress"
                type="range"
                min={0}
                max={100}
                step={0.1}
                value={progress}
                onChange={(event) => seek(Number(event.target.value))}
                aria-label="播放进度"
                style={{ '--value': `${progress}%` } as CSSProperties}
              />
              <span className="video-time video-time-total">{formatTime(totalSeconds)}</span>
              <button type="button" className="video-volume-btn" onClick={() => setMuted((value) => !value)} aria-label={muted ? '取消静音' : '静音'}>
                <Icon name="volume" size={18} />
              </button>
              <input
                className="video-volume"
                type="range"
                min={0}
                max={100}
                value={muted ? 0 : Math.round(settings.volume * 100)}
                onChange={(event) => {
                  const value = Number(event.target.value) / 100;
                  setMuted(value === 0);
                  updateSettings({ volume: value });
                }}
                aria-label="音量"
              />
              <button
                type="button"
                className="video-speed"
                onClick={cycleSpeed}
              >
                {speeds[speedIndex]}x
              </button>
              {episodes.length > 1 && (
                <button
                  type="button"
                  onClick={() => switchEpisode(episode)}
                  disabled={episode >= episodes.length}
                  aria-label="下一集"
                >
                  <Icon name="skipNext" size={18} />
                </button>
              )}
              <button type="button" onClick={() => setSheetOpen(true)} aria-label="播放设置">
                <Icon name="more" size={18} />
              </button>
              <button type="button" onClick={() => { void toggleFullscreen(); }} aria-label={fullscreen ? '退出全屏' : '全屏'}>
                <Icon name="fullscreen" size={18} />
              </button>
            </div>

            {locked && (
              <button type="button" className="player-unlock" onClick={() => setLocked(false)} aria-label="解锁控制">
                <Icon name="lock" size={15} />
                已锁定 · 点击解锁
              </button>
            )}

            {gestureHud && (
              <div className="player-gesture-hud" aria-hidden="true">
                <Icon name={gestureHud.kind === 'brightness' ? 'sun' : 'volume'} size={20} />
                <strong>{Math.round(gestureHud.value * 100)}%</strong>
                <span>{gestureHud.kind === 'brightness' ? '亮度' : '音量'}</span>
              </div>
            )}


          </div>

          <div className="player-meta">
            <div className="player-meta-head">
              <div>
                <h1>{title.name}</h1>
                <div className="player-meta-line">
                  {title.rating > 0 && <Rating value={title.rating} />}
                  {title.year > 0 && <span>{title.year}</span>}
                  {title.region ? <span>{title.region}</span> : null}
                  {title.duration ? <span>{title.duration}</span> : null}
                  {title.genres.length ? <span>{title.genres.join(' / ')}</span> : null}
                </div>
              </div>
              <div className="player-meta-actions">
                <Button
                  size="sm"
                  variant={isFavorite ? 'secondary' : 'ghost'}
                  icon="heart"
                  onClick={() => {
                    toggleFavorite(title);
                    toast(isFavorite ? '已取消收藏' : `已收藏《${title.name}》`, 'success');
                  }}
                >
                  {isFavorite ? '已收藏' : '收藏'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="external"
                  onClick={async () => {
                    const stream = /^https?:\/\//i.test(streamUrl) ? streamUrl : sourceUrl;
                    const url = /^https?:\/\//i.test(stream) ? stream : CLIENT_RELEASE_URL;
                    const result = await shareContent({
                      title: `《${title.name}》${current?.name ? ` · ${current.name}` : ''}`,
                      text: [title.source, title.quality].filter(Boolean).join(' · '),
                      url,
                    });
                    toast(
                      result === 'shared' ? '已分享' : result === 'copied' ? '分享内容已复制' : '分享失败',
                      result === 'failed' ? 'warning' : 'success',
                    );
                  }}
                >
                  分享
                </Button>
              </div>
            </div>
            <p className="player-synopsis">{title.synopsis}</p>
            <div className="player-source-line">
              <span className="source-badge"><i className={`status-dot ${videoError ? 'status-experimental' : 'status-ok'}`} />{title.source}</span>
              <span>·</span>
              <span>{title.quality}</span>
              <span>·</span>
              <span>{statusText}</span>
              <span>·</span>
              <span>{settings.adFilter ? '广告过滤开' : '广告过滤关'}</span>
              {title.sources?.length ? <><span>·</span><span>{title.sources.slice(0, 3).join(' / ')}</span></> : null}
            </div>
            {uniqueVariants.length > 1 && (
              <div className="player-source-switch">
                <span className="player-source-switch-label">播放源</span>
                {uniqueVariants.map((variant) => {
                  const variantKey = `${variant.sourceKey}:${variant.vodId}`;
                  return (
                    <button
                      type="button"
                      key={variantKey}
                      className={variantKey === activeVariantKey ? 'is-active' : ''}
                      onClick={() => variantKey !== activeVariantKey && switchToVariant(variant)}
                    >
                      {variant.sourceName}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <aside className="episode-panel">
          <div className="episode-panel-head">
            <div>
              <h3>选集</h3>
              <p>{title.type === '电影' ? '正片' : `共 ${Math.max(title.episodes, episodes.length)} 集`}</p>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="切换源"
              onClick={() => {
                const next = uniqueVariants.find((variant) => `${variant.sourceKey}:${variant.vodId}` !== activeVariantKey);
                if (next) switchToVariant(next);
                else toast('当前只有这一个可用源');
              }}
            >
              <Icon name="refresh" size={17} />
            </button>
          </div>
          <div className="episode-panel-list">
            {episodes.map((item, index) => (
              <button
                type="button"
                key={`${item.name}-${index}`}
                className={`episode-item ${episode === index + 1 ? 'is-active' : ''}`}
                onClick={() => switchEpisode(index)}
              >
                <span>{item.name}</span>
                {episode === index + 1 && <i className="episode-playing"><Icon name="play" size={10} /></i>}
              </button>
            ))}
          </div>
          <div className="episode-panel-foot">
            <Icon name="wifi" size={14} />
            {settings.autoNext ? '自动连播开' : '自动连播关'} · {settings.autoSwitchSource ? '自动换源开' : '自动换源关'}
          </div>
        </aside>
      </div>
            {sheetOpen && !locked && (
              <div className="player-sheet-layer" role="dialog" aria-modal="true" aria-label="播放设置">
                <button type="button" className="player-sheet-scrim" aria-label="关闭设置" onClick={() => setSheetOpen(false)} />
                <div className="player-sheet">
                  <div className="player-sheet-head">
                    <strong>播放设置</strong>
                    <button type="button" className="icon-btn" onClick={() => setSheetOpen(false)} aria-label="关闭">
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                  <div className="player-sheet-body">
                    <div className="player-sheet-section">
                      <span className="player-sheet-label">画面比例</span>
                      <div className="player-sheet-chips">
                        <Chip active={fitMode === 'contain'} onClick={() => changeFit('contain')}>自适应</Chip>
                        <Chip active={fitMode === 'cover'} onClick={() => changeFit('cover')}>填满</Chip>
                      </div>
                    </div>
                    {title.playLines && title.playLines.length > 1 && (
                      <div className="player-sheet-section">
                        <span className="player-sheet-label">线路</span>
                        <div className="player-sheet-chips">
                          {title.playLines.map((line, index) => (
                            <Chip key={`${line.name}-${index}`} active={lineIndex === index} onClick={() => switchLine(index)}>
                              {line.name}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="player-sheet-section">
                      <span className="player-sheet-label">清晰度</span>
                      <div className="player-sheet-chips">
                        <Chip active={qualityIndex < 0} onClick={() => selectQuality(-1)}>自动</Chip>
                        {levels.map((level) => (
                          <Chip key={level.index} active={qualityIndex === level.index} onClick={() => selectQuality(level.index)}>
                            {level.label}
                          </Chip>
                        ))}
                      </div>
                      {!levels.length && <small className="player-sheet-hint">当前源未提供多清晰度</small>}
                    </div>
                    <div className="player-sheet-section">
                      <span className="player-sheet-label">字幕</span>
                      <div className="player-sheet-chips">
                        <Chip active={subtitleId === -1} onClick={() => selectSubtitle(-1)}>关闭</Chip>
                        {localSubtitle && (
                          <Chip active={subtitleId === -2} onClick={selectLocalSubtitle}>{localSubtitle.name}</Chip>
                        )}
                        {subtitleTracks.map((track) => (
                          <Chip key={track.id} active={subtitleId === track.id} onClick={() => selectSubtitle(track.id)}>
                            {track.label}
                          </Chip>
                        ))}
                      </div>
                      {!subtitleTracks.length && !localSubtitle && <small className="player-sheet-hint">当前源未提供字幕轨</small>}
                      <div className="player-sheet-inline">
                        <button type="button" className="player-sheet-mini" onClick={() => subtitleInputRef.current?.click()}>
                          <Icon name="upload" size={13} />
                          加载本地字幕
                        </button>
                        {localSubtitle && (
                          <button type="button" className="player-sheet-mini" onClick={removeLocalSubtitle}>
                            <Icon name="trash" size={13} />
                            移除
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="player-sheet-section">
                      <span className="player-sheet-label">音轨</span>
                      <div className="player-sheet-chips">
                        {audioTracks.map((track) => (
                          <Chip key={track.id} active={audioId === track.id} onClick={() => selectAudio(track.id)}>
                            {track.label}
                          </Chip>
                        ))}
                      </div>
                      {!audioTracks.length && <small className="player-sheet-hint">当前源未提供多音轨</small>}
                    </div>
                    <div className="player-sheet-section">
                      <span className="player-sheet-label">选集 · 共 {episodes.length} 集</span>
                      <div className="player-sheet-episodes">
                        {episodes.map((item, index) => (
                          <button
                            type="button"
                            key={`${item.name}-${index}`}
                            className={`player-sheet-episode ${episode === index + 1 ? 'is-active' : ''}`}
                            onClick={() => { switchEpisode(index); setSheetOpen(false); }}
                          >
                            {item.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="player-sheet-actions">
                      {castSupported && (
                        <button
                          type="button"
                          onClick={async () => {
                            const video = videoRef.current as (HTMLVideoElement & { remote?: { prompt: () => Promise<void> } }) | null;
                            if (!video?.remote) {
                              toast('当前环境不支持投屏', 'warning');
                              return;
                            }
                            setSheetOpen(false);
                            try {
                              await video.remote.prompt();
                            } catch {
                              toast('未找到可投屏设备', 'warning');
                            }
                          }}
                        >
                          <Icon name="wifi" size={16} />
                          投屏
                        </button>
                      )}
                      {pipSupported && (
                        <button type="button" onClick={() => { setSheetOpen(false); void togglePip(); }}>
                          <Icon name="pip" size={16} />
                          画中画
                        </button>
                      )}
                      {cssFullscreen && (
                        <button type="button" onClick={lockScreen}>
                          <Icon name="lock" size={16} />
                          锁定屏幕
                        </button>
                      )}
                    </div>
                    <p className="player-sheet-tip">
                      全屏时：左侧上下滑调亮度，右侧上下滑调音量；锁定后可避免误触。
                      快捷键：空格 播放/暂停 · ←→ 快退/快进 · ↑↓ 音量 · M 静音 · F 全屏。
                    </p>
                  </div>
                </div>
              </div>
            )}
      <input
        ref={subtitleInputRef}
        type="file"
        accept=".srt,.vtt,text/vtt"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleSubtitleFile(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}