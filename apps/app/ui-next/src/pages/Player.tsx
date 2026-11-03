import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, TouchEvent as ReactTouchEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Hls from 'hls.js';
import type { Episode, Title } from '../data';
import { Icon } from '../icons';
import { useApp } from '../store';
import { historyToTitle } from '../lib/adapters';
import {
  enterAndroidPip,
  getAndroidMediaVolume,
  getAndroidScreenBrightness,
  hasAndroidMediaBridge,
  hasAndroidPipSupport,
  resetAndroidScreenBrightness,
  setAndroidMediaVolume,
  setAndroidScreenBrightness,
  stopAndroidPlayback,
  stopDlnaDevice,
  updateAndroidPlayback,
} from '../lib/androidNative';
import { refreshTitleDetail, useDetail } from '../lib/hooks';
import { isExpiredStreamError, selectRefreshedEpisode } from '../lib/playbackRefresh';
import { hlsConfigWithNativeLoader } from '../lib/hlsNativeLoader';
import { clampBrightness, clampVolume, gestureRatio, isDoubleTapAt, seekSecondsFromSwipe, tapSide } from '../lib/gesture';
import type { TapSide } from '../lib/gesture';
import { pickQualityLevel, qualityLabel } from '../lib/quality';
import { useWakeLock } from '../lib/wakeLock';
import { setMediaHandlers, setMediaInfo, setMediaPlaybackState } from '../lib/mediaSession';
import { CLIENT_RELEASE_URL, shareContent } from '../lib/share';
import { clampSubtitleOffset, normalizeSubtitle, shiftVtt } from '../lib/subtitles';
import { mergeEpisodeProgress, resumePositionFor } from '../lib/progress';
import { clearSkipMarks, loadSkipMarks, saveSkipMarks, shouldSkipIntro, shouldSkipOutro } from '../lib/skipMarks';
import type { SkipMarks } from '../lib/skipMarks';
import type { EpisodeProgress } from '../lib/storage';
import { httpText, isTauri } from '../lib/env';
import { setFullscreen } from '../lib/window';
import { Button, Chip, Rating } from '../ui';
import CastSheet from '../CastSheet';
import { useDlna } from '../lib/dlna';

const speeds = [1, 1.25, 1.5, 2];
const subtitleSizes = [
  { label: '小', value: 0.8 },
  { label: '标准', value: 1 },
  { label: '大', value: 1.25 },
  { label: '特大', value: 1.5 },
];
const subtitleColors = [
  { label: '白', value: '#ffffff' },
  { label: '黄', value: '#ffe066' },
  { label: '绿', value: '#7ee787' },
  { label: '蓝', value: '#7dd3fc' },
];
const subtitleBackgrounds = [
  { label: '无底', value: 'none' as const },
  { label: '阴影', value: 'shadow' as const },
  { label: '底色', value: 'block' as const },
];

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
  const routeEpisodeIndex = baseTitle?.playEpisodeIndex ?? historyRecord?.episodeIndex ?? 0;
  const [activeTitle, setActiveTitle] = useState<Title | undefined>(baseTitle);
  const triedRef = useRef<Set<string>>(new Set());
  const [switching, setSwitching] = useState(false);
  const { title: detailed, loading: detailLoading, error: detailError } = useDetail(activeTitle);
  const title = detailed ?? activeTitle;
  const demoTitle = !isTauri();
  const baseHasLine = baseTitle?.playLineIndex !== undefined;
  const [lineIndex, setLineIndex] = useState(() => baseTitle?.playLineIndex ?? 0);
  const linePickedRef = useRef(false);
  const lineAligned = baseHasLine || linePickedRef.current || !detailed
    || detailed.playLineIndex === undefined || lineIndex === detailed.playLineIndex;

  useEffect(() => {
    // 从历史/收藏进入时没有线路信息，详情加载后采用解析出的默认线路
    if (!baseHasLine && !linePickedRef.current && detailed?.playLineIndex !== undefined) {
      setLineIndex(detailed.playLineIndex);
    }
  }, [baseHasLine, detailed?.key, detailed?.playLineIndex]);

  const episodes = useMemo<Episode[]>(() => {
    if (!title) return [];
    if (title.playLines?.length) {
      return title.playLines[lineIndex]?.episodes ?? title.playLines[0]?.episodes ?? [];
    }
    if (title.episodesList?.length) return title.episodesList;
    if (title.playUrl) return [{ name: '正片', url: title.playUrl }];
    return demoTitle ? mockEpisodes(title) : [];
  }, [title, lineIndex, demoTitle]);
  const lineName = title?.playLines?.[lineIndex]?.name;

  const [episode, setEpisode] = useState(() => routeEpisodeIndex + 1);
  const progressMapRef = useRef<Record<string, EpisodeProgress>>(historyRecord?.episodeProgress ?? {});
  const [skipMarks, setSkipMarks] = useState<SkipMarks>(() => loadSkipMarks(rawKey));
  const introSkippedRef = useRef(false);
  const outroSkippedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const currentTimeRef = useRef(0);
  currentTimeRef.current = currentTime;

  useEffect(() => {
    setSkipMarks(loadSkipMarks(rawKey));
  }, [rawKey]);

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
  const [seekHud, setSeekHud] = useState<{ seconds: number } | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [subtitleTracks, setSubtitleTracks] = useState<{ id: number; label: string }[]>([]);
  const [audioTracks, setAudioTracks] = useState<{ id: number; label: string }[]>([]);
  const [subtitleId, setSubtitleId] = useState(-1);
  const [localSubtitle, setLocalSubtitle] = useState<{ name: string; vtt: string } | null>(null);
  const displaySubtitleVtt = useMemo(
    () => (localSubtitle ? shiftVtt(localSubtitle.vtt, settings.subtitleOffset) : ''),
    [localSubtitle, settings.subtitleOffset],
  );
  const subtitleOffsetLabel = `${settings.subtitleOffset > 0 ? '+' : ''}${settings.subtitleOffset.toFixed(1)}s`;
  const [audioId, setAudioId] = useState(0);
  const [pipSupported, setPipSupported] = useState(false);
  const castSupported = typeof HTMLVideoElement !== 'undefined' && 'remote' in HTMLVideoElement.prototype;
  const androidMediaBridge = hasAndroidMediaBridge();
  const androidPipAvailable = hasAndroidPipSupport();
  const dlna = useDlna();
  const [castOpen, setCastOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const subtitleTrackRef = useRef<HTMLTrackElement | null>(null);
  const subtitleUrlRef = useRef<string | null>(null);
  const hudTimer = useRef<number | null>(null);
  const gestureRef = useRef<{
    kind: 'brightness' | 'volume';
    side: TapSide;
    startY: number;
    startValue: number;
    startX: number;
    startTime: number;
    axis: 'pending' | 'horizontal' | 'vertical';
    seekFrom: number;
    seekSeconds: number;
    moved: boolean;
    longPress: boolean;
  } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const lastTapRef = useRef<number | null>(null);
  const singleTapTimerRef = useRef<number | null>(null);
  const rateBeforeLongPressRef = useRef(1);
  const lastNativeBrightnessRef = useRef(-1);
  const lastNativeVolumeRef = useRef(-1);
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
  const streamUrl = lineAligned ? playableUrl || (/\.m3u8/i.test(sourceUrl) ? sourceUrl : '') : '';

  useEffect(() => {
    introSkippedRef.current = false;
    outroSkippedRef.current = false;
  }, [streamUrl, episode]);
  const isMock = demoTitle && !streamUrl && !resolving;
  const isFavorite = favoriteKeys.has(rawKey);
  const key = rawKey;
  const rotateLandscape = device === 'android' && cssFullscreen && portrait;
  const sourceUrlRef = useRef(sourceUrl);
  sourceUrlRef.current = sourceUrl;

  useEffect(() => {
    if (detailError && !sourceUrl) setVideoError(`详情加载失败：${detailError}`);
  }, [detailError, sourceUrl]);

  useEffect(() => {
    if (demoTitle || !title || detailLoading || streamUrl || episodes.length) return;
    const timer = window.setTimeout(() => {
      if (!streamUrl && !episodes.length) setVideoError('未获取到可播放地址，请返回详情页重试');
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [demoTitle, title, detailLoading, streamUrl, episodes.length]);
  const freshAutoRef = useRef(false);
  const refreshingRef = useRef(false);
  const mountedRef = useRef(true);
  const refreshRef = useRef<(requireChange: boolean) => Promise<boolean>>(async () => false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (singleTapTimerRef.current !== null) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(orientation: portrait)');
    const onChange = (event: MediaQueryListEvent) => setPortrait(event.matches);
    const onResize = () => setPortrait(window.matchMedia('(orientation: portrait)').matches);
    media.addEventListener('change', onChange);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      media.removeEventListener('change', onChange);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
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
    setEpisode(routeEpisodeIndex + 1);
    setLineIndex(baseTitle?.playLineIndex ?? 0);
    linePickedRef.current = false;
    progressMapRef.current = historyRecord?.episodeProgress ?? {};
    preferredHeightRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawKey]);

  /* 每条地址/线路/剧集只自动尝试一次刷新，避免签名地址持续失效时循环 */
  useEffect(() => {
    freshAutoRef.current = false;
  }, [title?.key, lineIndex, episode]);

  /* 同一源内线路的失败记录，换集/换源后重置 */
  const triedLinesRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    triedLinesRef.current = new Set();
  }, [title?.key, episode]);

  /* ---------- 播放失败自动换源 ---------- */
  const tryNextVariant = useCallback((reason: string): boolean => {
    if (!title || !settings.autoSwitchSource) return false;
    const lines = title.playLines ?? [];
    if (lines.length > 1) {
      triedLinesRef.current.add(lineIndex);
      const nextLine = lines.findIndex((line, index) => index !== lineIndex && !triedLinesRef.current.has(index));
      if (nextLine >= 0) {
        const line = lines[nextLine];
        linePickedRef.current = true;
        setLineIndex(nextLine);
        setEpisode((value) => Math.min(value, line.episodes.length || value));
        setPlayableUrl('');
        setProgress(0);
        setCurrentTime(0);
        setVideoError(`播放失败（${reason}），正在切换到线路 ${line.name}…`);
        setReloadKey((value) => value + 1);
        toast(`已切换到线路 ${line.name}`, 'success');
        return true;
      }
    }
    const currentKey = title.key ?? title.id;
    const next = uniqueVariants.find((variant) => {
      const variantKey = `${variant.sourceKey}:${variant.vodId}`;
      return variantKey !== currentKey && !triedRef.current.has(variantKey);
    });
    if (!next) return false;
    linePickedRef.current = false;
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
      playLines: undefined,
      playLineIndex: undefined,
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
  }, [title, uniqueVariants, settings.autoSwitchSource, toast, lineIndex]);

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
      linePickedRef.current = true;
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
    if (!lineAligned) return;
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
  }, [sourceUrl, lineAligned]);

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
    video.volume = muted ? 0 : androidMediaBridge ? 1 : settings.volume;
    video.muted = muted;
  }, [streamUrl, settings.volume, muted, androidMediaBridge]);

  useEffect(() => {
    if (!androidMediaBridge) return;
    return () => resetAndroidScreenBrightness();
  }, [androidMediaBridge]);

  useEffect(() => {
    if (dlna.error) toast(dlna.error, 'warning');
  }, [dlna.error, toast]);

  useEffect(() => {
    const deviceId = dlna.castState?.deviceId;
    return () => {
      if (deviceId) stopDlnaDevice(deviceId);
    };
  }, [dlna.castState?.deviceId]);

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

  useEffect(() => () => {
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    const video = videoRef.current;
    if (video && rateBeforeLongPressRef.current) video.playbackRate = rateBeforeLongPressRef.current;
  }, []);

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
    if (!video || !localSubtitle || !displaySubtitleVtt) return;
    const url = URL.createObjectURL(new Blob([displaySubtitleVtt], { type: 'text/vtt' }));
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
  }, [localSubtitle, displaySubtitleVtt, streamUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl || !settings.remember || !lineAligned) return;
    const episodeName = current?.name || '正片';
    const saved = progressMapRef.current[episodeName];
    // 已看完的剧集从头播放，避免一打开就跳到大结局
    if (saved && saved.progress >= 98) return;
    const sameEpisode = !historyRecord?.episodeName || historyRecord.episodeName === episodeName;
    const fallback = sameEpisode ? historyRecord?.position ?? 0 : 0;
    const resumeAt = resumePositionFor(progressMapRef.current, episodeName, fallback);
    if (resumeAt <= 0) return;
    const onLoaded = () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      if (duration > 0 && resumeAt >= duration - 30) return;
      const target = duration > 0 ? Math.min(resumeAt, Math.max(0, duration - 15)) : resumeAt;
      if (target <= 10) return;
      video.currentTime = target;
      toast(`已恢复到 ${formatTime(target)}`, 'success');
    };
    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    return () => video.removeEventListener('loadedmetadata', onLoaded);
  }, [streamUrl, settings.remember, current?.name, historyRecord?.episodeName, historyRecord?.position, toast, lineAligned]);

  const persistHistory = useCallback(() => {
    if (!title || !streamUrl || !lineAligned) return;
    const video = videoRef.current;
    const position = isMock ? currentTimeRef.current : video?.currentTime ?? 0;
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
      type: title.type,
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
  }, [title, isMock, recordHistory, key, streamUrl, current?.name, episode, lineAligned]);

  /* 只在真正从播放变为暂停时保存一次；不要在初次加载/切集时写 0 进度 */
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    if (playing) {
      wasPlayingRef.current = true;
      return;
    }
    if (!wasPlayingRef.current) return;
    wasPlayingRef.current = false;
    persistHistory();
  }, [playing, persistHistory]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(persistHistory, 10000);
    return () => window.clearInterval(timer);
  }, [playing, persistHistory]);

  const persistRef = useRef(persistHistory);
  persistRef.current = persistHistory;
  useEffect(() => () => {
    const video = videoRef.current;
    if (video && Number.isFinite(video.duration) && video.duration > 0) persistRef.current();
  }, []);

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
      const syncOrientation = () => setPortrait(window.matchMedia('(orientation: portrait)').matches);
      syncOrientation();
      window.setTimeout(syncOrientation, 300);
      window.setTimeout(syncOrientation, 800);
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

  const markIntroEnd = () => {
    const video = videoRef.current;
    if (!video || isMock) return;
    const duration = video.duration || 0;
    const value = Math.min(video.currentTime, duration > 0 ? Math.max(0, duration - 3) : video.currentTime);
    if (!Number.isFinite(value) || value < 3) {
      toast('请播放几秒后再标记片头结束', 'warning');
      return;
    }
    const next = { ...skipMarks, introEnd: value };
    setSkipMarks(next);
    saveSkipMarks(rawKey, next);
    introSkippedRef.current = true;
    toast(`片头结束：${formatTime(value)}`, 'success');
  };

  const markOutroStart = () => {
    const video = videoRef.current;
    if (!video || isMock) return;
    const duration = video.duration || 0;
    const value = Math.max(3, video.currentTime);
    if (!duration || value > duration - 3) {
      toast('请在片尾开始前标记', 'warning');
      return;
    }
    const next = { ...skipMarks, outroStart: value };
    setSkipMarks(next);
    saveSkipMarks(rawKey, next);
    outroSkippedRef.current = true;
    toast(`片尾开始：${formatTime(value)}`, 'success');
  };

  const clearSkips = () => {
    setSkipMarks({ introEnd: 0, outroStart: 0 });
    clearSkipMarks(rawKey);
    introSkippedRef.current = false;
    outroSkippedRef.current = false;
    toast('已清除片头/片尾标记', 'success');
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const clearSingleTapTimer = () => {
    if (singleTapTimerRef.current !== null) {
      window.clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }
  };

  const onSurfaceTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (locked || sheetOpen) return;
    const target = event.target as HTMLElement;
    if (target.closest('.video-controls, .player-sheet-layer, .player-unlock, .video-play-big, .video-error, .video-center')) return;
    clearSingleTapTimer();
    setSeekHud(null);
    setGestureHud(null);
    const touch = event.touches[0];
    if (!touch) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const side = tapSide(touch.clientX - rect.left, rect.width);
    const nativeBrightness = androidMediaBridge ? getAndroidScreenBrightness() : null;
    const nativeVolume = androidMediaBridge ? getAndroidMediaVolume() : null;
    gestureRef.current = {
      kind: side === 'left' ? 'brightness' : 'volume',
      side,
      startY: touch.clientY,
      startValue: side === 'left'
        ? (nativeBrightness !== null ? nativeBrightness / 100 : brightness)
        : (nativeVolume !== null ? nativeVolume / 100 : (videoRef.current?.volume ?? settings.volume)),
      startX: touch.clientX,
      startTime: Date.now(),
      axis: 'pending',
      seekFrom: videoRef.current?.currentTime ?? 0,
      seekSeconds: 0,
      moved: false,
      longPress: false,
    };
    lastNativeBrightnessRef.current = -1;
    lastNativeVolumeRef.current = -1;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      const currentGesture = gestureRef.current;
      if (!currentGesture || currentGesture.moved || currentGesture.longPress || !playing) return;
      currentGesture.longPress = true;
      const video = videoRef.current;
      if (video) {
        rateBeforeLongPressRef.current = video.playbackRate;
        video.playbackRate = 2;
      }
      toast('2 倍速播放中，松开恢复', 'success');
    }, 450);
  };

  const onSurfaceTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    const touch = event.touches[0];
    if (!gesture || !touch) return;
    const dx = Math.abs(touch.clientX - gesture.startX);
    const dy = Math.abs(touch.clientY - gesture.startY);
    if (!gesture.moved && (dx > 8 || dy > 8)) {
      gesture.moved = true;
      gesture.axis = dx > dy ? 'horizontal' : 'vertical';
      clearLongPressTimer();
    }
    if (gesture.longPress || !gesture.moved) return;
    if (gesture.axis === 'horizontal') {
      setGestureHud(null);
      const rect = event.currentTarget.getBoundingClientRect();
      const seconds = seekSecondsFromSwipe(touch.clientX - gesture.startX, rect.width);
      gesture.seekSeconds = seconds;
      setSeekHud({ seconds });
      return;
    }
    setSeekHud(null);
    const delta = gestureRatio(gesture.startY, touch.clientY, window.innerHeight);
    if (gesture.kind === 'brightness') {
      const value = androidMediaBridge
        ? Math.min(1, Math.max(0.05, gesture.startValue + delta * 1.3))
        : clampBrightness(gesture.startValue + delta * 1.3);
      if (androidMediaBridge) {
        const percent = Math.round(value * 100);
        if (percent !== lastNativeBrightnessRef.current) {
          lastNativeBrightnessRef.current = percent;
          setAndroidScreenBrightness(percent);
        }
      } else {
        setBrightness(value);
      }
      flashHud('brightness', value);
      return;
    }
    const value = clampVolume(gesture.startValue + delta);
    const video = videoRef.current;
    if (androidMediaBridge) {
      const percent = Math.round(value * 100);
      if (percent !== lastNativeVolumeRef.current) {
        lastNativeVolumeRef.current = percent;
        setAndroidMediaVolume(percent);
      }
      if (video) {
        video.volume = value === 0 ? 0 : 1;
        video.muted = value === 0;
      }
    } else if (video) {
      video.volume = value;
      video.muted = value === 0;
    }
    setMuted(value === 0);
    flashHud('volume', value);
  };

  const onSurfaceTouchEnd = () => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    clearLongPressTimer();
    if (!gesture) return;
    if (gesture.longPress) {
      const video = videoRef.current;
      if (video) video.playbackRate = rateBeforeLongPressRef.current || speeds[speedIndex] || 1;
      return;
    }
    if (gesture.moved) {
      setSeekHud(null);
      setGestureHud(null);
      if (gesture.axis === 'horizontal') {
        const video = videoRef.current;
        if (video && Number.isFinite(video.duration) && video.duration > 0) {
          video.currentTime = Math.max(0, Math.min(video.duration, gesture.seekFrom + gesture.seekSeconds));
          setCurrentTime(video.currentTime);
        } else {
          skipBy(gesture.seekSeconds);
        }
        return;
      }
      if (gesture.kind === 'volume' && !androidMediaBridge) {
        updateSettings({ volume: videoRef.current?.volume ?? settings.volume });
      }
      return;
    }
    setSeekHud(null);
    if (Date.now() - gesture.startTime > 300) return;
    const now = Date.now();
    if (isDoubleTapAt(lastTapRef.current, now)) {
      lastTapRef.current = null;
      togglePlay();
      return;
    }
    lastTapRef.current = now;
    clearSingleTapTimer();
    singleTapTimerRef.current = window.setTimeout(() => {
      setControlsVisible((value) => !value);
      singleTapTimerRef.current = null;
    }, 260);
  };

  const onSurfaceTouchCancel = () => {
    setSeekHud(null);
    if (gestureRef.current?.longPress) {
      const video = videoRef.current;
      if (video) video.playbackRate = rateBeforeLongPressRef.current || speeds[speedIndex] || 1;
    }
    gestureRef.current = null;
    clearLongPressTimer();
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
    const line = title?.playLines?.[index];
    if (!line) return;
    linePickedRef.current = true;
    persistHistory();
    // 保留当前集数，只换线路；新线路集数更少时取最后一集
    setEpisode((value) => Math.min(value, line.episodes.length || value));
    setLineIndex(index);
    setCurrentTime(0);
    setProgress(0);
    setPlaying(true);
    setVideoError(null);
    setSheetOpen(false);
    toast(`已切换到线路 ${line.name}`, 'success');
  };

  const switchToVariant = (variant: { sourceKey: string; sourceName: string; vodId: string }) => {
    if (!title) return;
    persistHistory();
    linePickedRef.current = false;
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
      playLines: undefined,
      playLineIndex: undefined,
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
            className={`video-surface ${locked ? 'is-locked' : ''} ${controlsVisible ? '' : 'is-controls-hidden'}`}
            style={{ '--h': title.hue } as CSSProperties}
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
                filter: !androidMediaBridge && brightness !== 1 ? `brightness(${brightness})` : undefined,
                '--sub-scale': settings.subtitleSize,
                '--sub-color': settings.subtitleColor,
                '--sub-bg': settings.subtitleBackground === 'block' ? 'rgba(0, 0, 0, .72)' : 'transparent',
                '--sub-shadow': settings.subtitleBackground === 'shadow'
                  ? '0 1px 3px rgba(0, 0, 0, .95), 0 0 8px rgba(0, 0, 0, .85)'
                  : 'none',
              } as CSSProperties}
              onTimeUpdate={(event) => {
                const video = event.currentTarget;
                setCurrentTime(video.currentTime);
                setDuration(video.duration || 0);
                setProgress(video.duration ? (video.currentTime / video.duration) * 100 : 0);
                if (!isMock && settings.autoSkip && !introSkippedRef.current && shouldSkipIntro(video.currentTime, skipMarks)) {
                  introSkippedRef.current = true;
                  video.currentTime = skipMarks.introEnd;
                  toast('已跳过片头', 'success');
                  return;
                }
                if (!isMock && settings.autoSkip && !outroSkippedRef.current && shouldSkipOutro(video.currentTime, video.duration || 0, skipMarks)) {
                  outroSkippedRef.current = true;
                  if (settings.autoNext && episode < episodes.length) {
                    switchEpisode(episode);
                    toast('已跳过片尾，播放下一集', 'success');
                  } else {
                    video.pause();
                    setPlaying(false);
                    toast('已跳过片尾', 'success');
                  }
                }
              }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                persistHistory();
                if (settings.autoNext && episode < episodes.length) switchEpisode(episode);
                else setPlaying(false);
              }}
            />
            <div
              className="video-gesture-layer"
              aria-hidden="true"
              onTouchStart={onSurfaceTouchStart}
              onTouchMove={onSurfaceTouchMove}
              onTouchEnd={onSurfaceTouchEnd}
              onTouchCancel={onSurfaceTouchCancel}
              onContextMenu={(event) => event.preventDefault()}
              onDoubleClick={() => {
                if (device !== 'windows' || locked || sheetOpen) return;
                togglePlay();
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
            {seekHud && (
              <div className="player-gesture-hud" aria-hidden="true">
                <Icon name={seekHud.seconds >= 0 ? 'forward10' : 'rewind10'} size={20} />
                <strong>{Math.abs(seekHud.seconds)}s</strong>
                <span>{seekHud.seconds >= 0 ? '快进' : '快退'}</span>
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
                      <div className="player-sheet-inline">
                        {subtitleSizes.map((item) => (
                          <Chip key={item.label} active={settings.subtitleSize === item.value} onClick={() => updateSettings({ subtitleSize: item.value })}>
                            {item.label}
                          </Chip>
                        ))}
                      </div>
                      <div className="player-sheet-inline">
                        {subtitleColors.map((item) => (
                          <Chip key={item.value} active={settings.subtitleColor === item.value} onClick={() => updateSettings({ subtitleColor: item.value })}>
                            {item.label}
                          </Chip>
                        ))}
                        {subtitleBackgrounds.map((item) => (
                          <Chip key={item.value} active={settings.subtitleBackground === item.value} onClick={() => updateSettings({ subtitleBackground: item.value })}>
                            {item.label}
                          </Chip>
                        ))}
                      </div>
                      <div className="player-sheet-inline">
                        <button
                          type="button"
                          className="player-sheet-mini"
                          onClick={() => updateSettings({ subtitleOffset: clampSubtitleOffset(settings.subtitleOffset - 0.5) })}
                        >
                          -0.5 秒
                        </button>
                        <span className="player-sheet-mini">{subtitleOffsetLabel}</span>
                        <button
                          type="button"
                          className="player-sheet-mini"
                          onClick={() => updateSettings({ subtitleOffset: clampSubtitleOffset(settings.subtitleOffset + 0.5) })}
                        >
                          +0.5 秒
                        </button>
                        <button type="button" className="player-sheet-mini" onClick={() => updateSettings({ subtitleOffset: 0 })}>
                          重置
                        </button>
                      </div>
                      <small className="player-sheet-hint">样式对字幕轨生效；时间偏移仅对外挂字幕生效</small>
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
                      {(castSupported || device === 'android') && (
                        <button
                          type="button"
                          onClick={async () => {
                            const video = videoRef.current as (HTMLVideoElement & { remote?: { prompt: () => Promise<void> } }) | null;
                            setSheetOpen(false);
                            if (device === 'android') {
                              if (!streamUrl) {
                                toast('播放地址未就绪，暂不能投屏', 'warning');
                                return;
                              }
                              setCastOpen(true);
                              return;
                            }
                            if (video?.remote) {
                              try {
                                await video.remote.prompt();
                                return;
                              } catch {
                                toast('未找到可投屏设备', 'warning');
                                return;
                              }
                            }
                            toast('当前环境不支持投屏', 'warning');
                          }}
                        >
                          <Icon name="wifi" size={16} />
                          {dlna.castState ? '投屏中' : '投屏'}
                        </button>
                      )}
                      {(pipSupported || androidPipAvailable) && (
                        <button
                          type="button"
                          onClick={() => {
                            if (androidPipAvailable) {
                              if (!playing) {
                                toast('请先开始播放再进入画中画', 'warning');
                                return;
                              }
                              setSheetOpen(false);
                              if (!enterAndroidPip()) toast('当前环境不支持画中画', 'warning');
                              return;
                            }
                            setSheetOpen(false);
                            void togglePip();
                          }}
                        >
                          <Icon name="pip" size={16} />
                          画中画
                        </button>
                      )}
                      {!isMock && (
                        <>
                          <button type="button" onClick={markIntroEnd}>
                            <Icon name="clock" size={16} />
                            片头结束 {skipMarks.introEnd ? formatTime(skipMarks.introEnd) : '未标记'}
                          </button>
                          <button type="button" onClick={markOutroStart}>
                            <Icon name="clock" size={16} />
                            片尾开始 {skipMarks.outroStart ? formatTime(skipMarks.outroStart) : '未标记'}
                          </button>
                          {(skipMarks.introEnd > 0 || skipMarks.outroStart > 0) && (
                            <button type="button" onClick={clearSkips}>
                              <Icon name="close" size={16} />
                              清除跳过
                            </button>
                          )}
                        </>
                      )}
                      {cssFullscreen && (
                        <button type="button" onClick={lockScreen}>
                          <Icon name="lock" size={16} />
                          锁定屏幕
                        </button>
                      )}
                    </div>
                    <p className="player-sheet-tip">
                      左右滑动快进/快退，单击显隐控制条，双击播放/暂停；左侧上下滑亮度、右侧音量；长按 2 倍速。
                      播放到片头结束/片尾开始时点上方按钮标记，开启自动跳过后生效。
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
      <CastSheet
        open={castOpen}
        url={streamUrl}
        title={`${title.name}${current?.name ? ` · ${current.name}` : ''}`}
        controller={dlna}
        onClose={() => setCastOpen(false)}
        onCast={(device) => {
          videoRef.current?.pause();
          setPlaying(false);
          toast(`正在投屏到 ${device.name}`, 'success');
        }}
      />
    </div>
  );
}