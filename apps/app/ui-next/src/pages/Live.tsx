import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, TouchEvent as ReactTouchEvent } from 'react';
import Hls from 'hls.js';
import { channels as mockChannelData, liveSources } from '../data';
import { Icon } from '../icons';
import { useApp } from '../store';
import { hashHue } from '../lib/adapters';
import { groupChannels, parsePlaylist } from '../lib/liveParser';
import type { LiveChannel } from '../lib/liveParser';
import { channelKey, findChannelMatch } from '../lib/liveChannel';
import { hlsConfigWithNativeLoader } from '../lib/hlsNativeLoader';
import { useWakeLock } from '../lib/wakeLock';
import { setMediaHandlers, setMediaInfo, setMediaPlaybackState } from '../lib/mediaSession';
import {
  favoriteKey,
  loadLiveFavorites,
  mergeLiveFavorite,
  saveLiveFavorites,
} from '../lib/liveFavorites';
import type { LiveFavorite } from '../lib/liveFavorites';
import { loadLiveRecent, recordLiveRecent, saveLiveRecent } from '../lib/liveRecent';
import type { LiveRecent } from '../lib/liveRecent';
import { useLivePlaylist, useEpg } from '../lib/hooks';
import { currentProgram, epgDate, nextProgram } from '../lib/epg';
import type { EpgProgram } from '../lib/epg';
import {
  epgReminderId,
  epgReminderTime,
  isEpgReminderSet,
  loadEpgReminders,
  saveEpgReminders,
  toggleEpgReminder,
} from '../lib/epgReminders';
import type { EpgReminder } from '../lib/epgReminders';
import { EPG_REMINDERS_CHANGED, notifyEpgRemindersChanged } from '../EpgReminderScheduler';
import CastSheet from '../CastSheet';
import { useDlna } from '../lib/dlna';
import { clampBrightness, clampVolume, gestureRatio, tapSide } from '../lib/gesture';
import {
  cancelAndroidEpgReminder,
  getAndroidMediaVolume,
  getAndroidScreenBrightness,
  hasAndroidMediaBridge,
  resetAndroidScreenBrightness,
  setAndroidMediaVolume,
  setAndroidScreenBrightness,
  stopAndroidPlayback,
  stopDlnaDevice,
  updateAndroidPlayback,
} from '../lib/androidNative';
import { httpText, isTauri } from '../lib/env';
import { Button, Chip } from '../ui';

const fallbackChannels: LiveChannel[] = mockChannelData.map((channel) => ({
  id: channel.id,
  name: channel.name,
  group: channel.group,
  url: '',
  logo: '',
  tvgId: '',
}));

function ChannelLogo({ name, logo }: { name: string; logo?: string }) {
  return (
    <span className="live-channel-logo" style={{ '--h': hashHue(name) } as CSSProperties}>
      <span className="live-channel-initial">{name.slice(0, 1)}</span>
      {logo ? (
        <img
          src={logo}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(event) => { event.currentTarget.remove(); }}
        />
      ) : null}
    </span>
  );
}

export default function Live() {
  const { toast, device, customLiveSources, settings, updateSettings } = useApp();
  const [sourceIndex, setSourceIndex] = useState(0);
  const [group, setGroup] = useState('全部');
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const sources = useMemo(() => [
    ...liveSources,
    ...customLiveSources
      .filter((item) => item.enabled !== false)
      .map((item, index) => ({ key: `custom-live-${index}`, name: item.name, count: 0, epg: '', url: item.url })),
  ], [customLiveSources]);
  const source = sources[sourceIndex] || sources[0];
  const { loading, channels: loaded, error } = useLivePlaylist(source.url, reloadKey);
  const demo = !isTauri();
  const list = loaded.length ? loaded : demo ? fallbackChannels : [];
  const [selectedId, setSelectedId] = useState<string>('');
  const [epgDay, setEpgDay] = useState(0);
  const [reminders, setReminders] = useState<EpgReminder[]>(loadEpgReminders);
  const [playing, setPlaying] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [cssFullscreen, setCssFullscreen] = useState(false);
  const [favorites, setFavorites] = useState<LiveFavorite[]>(loadLiveFavorites);
  const [recent, setRecent] = useState<LiveRecent[]>(loadLiveRecent);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [muted, setMuted] = useState(false);
  const castSupported = typeof HTMLVideoElement !== 'undefined' && 'remote' in HTMLVideoElement.prototype;
  const androidMediaBridge = hasAndroidMediaBridge();
  const dlna = useDlna();
  const [castOpen, setCastOpen] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [gestureHud, setGestureHud] = useState<{ kind: 'brightness' | 'volume'; value: number } | null>(null);
  const gestureRef = useRef<{ kind: 'brightness' | 'volume'; startY: number; startValue: number; startX: number; moved: boolean } | null>(null);
  const hudTimer = useRef<number | null>(null);
  const lastNativeBrightnessRef = useRef(-1);
  const lastNativeVolumeRef = useRef(-1);
  const [portrait, setPortrait] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(orientation: portrait)').matches : false,
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const pendingSelectRef = useRef<{ channelId: string; key: string; name: string } | null>(null);
  const channelCacheRef = useRef<Map<string, LiveChannel[]>>(new Map());
  const failoverRef = useRef(false);
  const failoverTokenRef = useRef(0);
  const failoverHandlerRef = useRef<(channel: LiveChannel, reason: string) => void>(() => undefined);
  const rotateLandscape = device === 'android' && cssFullscreen && portrait;
  const rememberRecent = useCallback((channel: LiveChannel, sourceKey = source.key, sourceName = source.name) => {
    if (!channel.url) return;
    setRecent((prev) => {
      const next = recordLiveRecent(prev, {
        name: channel.name,
        group: channel.group,
        sourceKey,
        sourceName,
        channelId: channel.id,
        logo: channel.logo,
      });
      saveLiveRecent(next);
      return next;
    });
  }, [source.key, source.name]);

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

  useEffect(() => {
    if (device !== 'android' || !cssFullscreen) return;
    const orientation = window.screen?.orientation as unknown as { lock?: (mode: string) => Promise<void>; unlock?: () => void } | undefined;
    void orientation?.lock?.('landscape').catch(() => undefined);
    return () => { orientation?.unlock?.(); };
  }, [device, cssFullscreen]);

  const toggleFullscreen = () => {
    const next = !cssFullscreen;
    setCssFullscreen(next);
    const syncOrientation = () => setPortrait(window.matchMedia('(orientation: portrait)').matches);
    syncOrientation();
    window.setTimeout(syncOrientation, 300);
    window.setTimeout(syncOrientation, 800);
    if (next && device === 'android' && portrait) toast('已横向铺满，请旋转手机观看', 'success');
  };

  const selected = list.find((channel) => channel.id === selectedId) ?? list[0];
  const favoriteSet = useMemo(
    () => new Set(favorites.map((favorite) => favoriteKey(favorite))),
    [favorites],
  );
  const selectedFavorite = selected ? favoriteSet.has(channelKey(selected)) : false;
  const epgDateStr = useMemo(() => epgDate(epgDay), [epgDay]);
  const epg = useEpg(selected, epgDateStr, settings.customEpgUrl);
  const programNow = epgDay === 0 && epg.data ? currentProgram(epg.data.programs) : undefined;
  const programNext = epg.data ? nextProgram(epg.data.programs) : undefined;

  useEffect(() => {
    const sync = () => setReminders(loadEpgReminders());
    window.addEventListener(EPG_REMINDERS_CHANGED, sync);
    return () => window.removeEventListener(EPG_REMINDERS_CHANGED, sync);
  }, []);

  const isFutureProgram = (program: EpgProgram) => {
    const today = epgDate(0);
    if (epgDateStr > today) return true;
    if (epgDateStr < today) return false;
    const now = new Date();
    return program.start > `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  const isProgramReminded = (program: EpgProgram) => Boolean(
    selected && isEpgReminderSet(reminders, epgReminderId(selected, source.key, epgDateStr, program.start)),
  );

  const toggleProgramReminder = (program: EpgProgram) => {
    if (!selected) return;
    const id = epgReminderId(selected, source.key, epgDateStr, program.start);
    if (isEpgReminderSet(reminders, id)) {
      const next = reminders.filter((item) => item.id !== id);
      setReminders(next);
      saveEpgReminders(next);
      cancelAndroidEpgReminder(id);
      notifyEpgRemindersChanged();
      toast('已取消节目提醒', 'success');
      return;
    }
    const triggerAt = epgReminderTime(epgDateStr, program.start);
    if (!triggerAt || triggerAt <= Date.now()) {
      toast('节目已开始，无法设置提醒', 'warning');
      return;
    }
    const reminder: EpgReminder = {
      id,
      channelName: selected.name,
      tvgId: selected.tvgId,
      sourceKey: source.key,
      sourceName: source.name,
      date: epgDateStr,
      start: program.start,
      end: program.end,
      title: program.title,
      triggerAt,
    };
    const next = toggleEpgReminder(reminders, reminder);
    setReminders(next);
    saveEpgReminders(next);
    notifyEpgRemindersChanged();
    toast('已设置节目提醒，节目开始时通知', 'success');
  };

  /* Android 返回键：全屏时先退出全屏 */
  useEffect(() => {
    const onBack = (event: Event) => {
      if (!cssFullscreen) return;
      event.preventDefault();
      setCssFullscreen(false);
    };
    window.addEventListener('lsu:back', onBack);
    return () => window.removeEventListener('lsu:back', onBack);
  }, [cssFullscreen]);

  useEffect(() => {
    if (loaded.length) channelCacheRef.current.set(source.key, loaded);
  }, [loaded, source.key]);

  useEffect(() => {
    if (!list.length) return;
    const pending = pendingSelectRef.current;
    if (pending) {
      pendingSelectRef.current = null;
      const match = list.find((channel) => channel.id === pending.channelId)
        || list.find((channel) => channelKey(channel) === pending.key)
        || findChannelMatch(list, { name: pending.name, tvgId: '' });
      if (match) {
        setSelectedId(match.id);
        setPlaying(true);
        setGroup('全部');
        rememberRecent(match);
        return;
      }
      toast('该源频道已变化，已显示可用频道', 'warning');
    }
    setSelectedId((current) => (list.some((channel) => channel.id === current) ? current : list[0].id));
    setGroup('全部');
  }, [list, rememberRecent, toast]);

  useEffect(() => {
    const video = videoRef.current;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    setPlayerError(null);
    const url = selected?.url;
    if (!video || !url) {
      setPlaying(false);
      return;
    }
    if (Hls.isSupported()) {
      const hls = new Hls(hlsConfigWithNativeLoader());
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data?.fatal) return;
        const reason = data.details || '频道播放失败';
        setPlayerError(reason);
        if (selected) failoverHandlerRef.current(selected, reason);
      });
      hlsRef.current = hls;
    } else {
      video.src = url;
    }
    video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [selected?.url, selected?.id, retryKey]);

  useWakeLock(playing && Boolean(selected?.url));

  useEffect(() => {
    if (!selected) return;
    setMediaInfo({
      title: selected.name,
      subtitle: [selected.group, source.name].filter(Boolean).join(' · '),
      poster: selected.logo || undefined,
    });
    setMediaHandlers({
      play: () => { void videoRef.current?.play(); },
      pause: () => { videoRef.current?.pause(); },
    });
    return () => {
      setMediaHandlers({ play: null, pause: null });
      setMediaInfo(null);
    };
  }, [selected?.id, selected?.name, selected?.group, selected?.logo, source.name]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    video.volume = muted ? 0 : androidMediaBridge ? 1 : settings.volume;
  }, [muted, settings.volume, selected?.id, androidMediaBridge]);

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
    setMediaPlaybackState(playing ? 'playing' : 'paused');
  }, [playing]);

  const groups = useMemo(() => groupChannels(list), [list]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return list.filter((channel) => {
      if (showFavorites && !favoriteSet.has(channelKey(channel))) return false;
      if (!showFavorites && group !== '全部' && channel.group !== group) return false;
      if (text && !`${channel.name} ${channel.group}`.toLowerCase().includes(text)) return false;
      return true;
    });
  }, [list, group, query, showFavorites, favoriteSet]);

  const recentFiltered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return recent.filter((entry) => {
      if (!text) return true;
      return `${entry.name} ${entry.group} ${entry.sourceName || ''}`.toLowerCase().includes(text);
    });
  }, [recent, query]);
  const sourceNameOf = (key: string) => sources.find((item) => item.key === key)?.name || '其它源';

  const hue = selected ? hashHue(selected.name) : 210;
  const usingFallback = !loaded.length && demo;

  const switchSource = (index: number, options?: { failover?: boolean; quiet?: boolean }) => {
    if (!options?.failover) {
      failoverRef.current = false;
      failoverTokenRef.current += 1;
      pendingSelectRef.current = null;
    }
    setSourceIndex(index);
    setGroup('全部');
    setQuery('');
    setShowFavorites(false);
    setShowRecent(false);
    if (!options?.quiet) toast(`已切换到 ${sources[index].name}`, 'success');
  };

  const getChannelsForSource = async (candidate: (typeof sources)[number]): Promise<LiveChannel[]> => {
    const cached = channelCacheRef.current.get(candidate.key);
    if (cached) return cached;
    if (!candidate.url) throw new Error('直播源地址为空');
    const text = await httpText(candidate.url, { timeoutSecs: 20 });
    const channels = parsePlaylist(text);
    channelCacheRef.current.set(candidate.key, channels);
    return channels;
  };

  const tryLiveFailover = async (channel: LiveChannel, reason: string) => {
    if (!isTauri() || failoverRef.current) return;
    failoverRef.current = true;
    const token = failoverTokenRef.current;
    setPlayerError(`${reason}，正在查找同频道备用源…`);
    const others = sources
      .map((item, index) => ({ item, index }))
      .filter(({ index }) => index !== sourceIndex);
    const results = await Promise.all(others.map(async ({ item, index }) => {
      try {
        const channels = await getChannelsForSource(item);
        return { item, index, match: findChannelMatch(channels, channel) };
      } catch {
        return { item, index, match: undefined };
      }
    }));
    if (token !== failoverTokenRef.current) return;
    const found = results.find((result) => result.match);
    if (!found?.match) {
      setPlayerError(`${reason}，未找到同频道备用源`);
      return;
    }
    pendingSelectRef.current = {
      channelId: found.match.id,
      key: channelKey(found.match),
      name: found.match.name,
    };
    failoverRef.current = true;
    setPlayerError(null);
    switchSource(found.index, { failover: true, quiet: true });
    toast(`已切换到 ${found.item.name} 的同频道`, 'success');
  };
  failoverHandlerRef.current = (channel, reason) => { void tryLiveFailover(channel, reason); };

  const toggleFavoriteChannel = () => {
    if (!selected) return;
    const next = mergeLiveFavorite(favorites, {
      sourceKey: source.key,
      channelId: selected.id,
      name: selected.name,
      group: selected.group,
      logo: selected.logo,
    });
    setFavorites(next);
    saveLiveFavorites(next);
    toast(selectedFavorite ? `已取消收藏 ${selected.name}` : `已收藏 ${selected.name}`, 'success');
  };

  const selectChannel = (channel: LiveChannel) => {
    failoverRef.current = false;
    failoverTokenRef.current += 1;
    setSelectedId(channel.id);
    setPlaying(true);
    setShowRecent(false);
    setShowFavorites(false);
    rememberRecent(channel);
    toast(`正在播放 ${channel.name}`);
  };

  const openRecent = (entry: LiveRecent) => {
    const index = sources.findIndex((item) => item.key === entry.sourceKey);
    if (index >= 0 && index !== sourceIndex) {
      pendingSelectRef.current = { channelId: entry.channelId, key: entry.key, name: entry.name };
      failoverRef.current = false;
      failoverTokenRef.current += 1;
      switchSource(index, { failover: true });
      return;
    }
    const match = list.find((channel) => channel.id === entry.channelId)
      || list.find((channel) => channelKey(channel) === entry.key)
      || findChannelMatch(list, { name: entry.name, tvgId: '' });
    if (match) selectChannel(match);
    else toast('当前源未找到该频道，请切换其它直播源', 'warning');
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (video && selected?.url) {
      if (video.paused) video.play().then(() => setPlaying(true)).catch(() => undefined);
      else { video.pause(); setPlaying(false); }
    } else {
      setPlaying((value) => !value);
    }
  };

  const flashHud = (kind: 'brightness' | 'volume', value: number) => {
    setGestureHud({ kind, value });
    if (hudTimer.current) window.clearTimeout(hudTimer.current);
    hudTimer.current = window.setTimeout(() => setGestureHud(null), 700);
  };

  const onLiveTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('.live-screen-controls, .live-screen-center, .video-error, .live-screen-top')) return;
    const touch = event.touches[0];
    if (!touch) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const side = tapSide(touch.clientX - rect.left, rect.width);
    const nativeBrightness = androidMediaBridge ? getAndroidScreenBrightness() : null;
    const nativeVolume = androidMediaBridge ? getAndroidMediaVolume() : null;
    gestureRef.current = {
      kind: side === 'left' ? 'brightness' : 'volume',
      startY: touch.clientY,
      startValue: side === 'left'
        ? (nativeBrightness !== null ? nativeBrightness / 100 : brightness)
        : (nativeVolume !== null ? nativeVolume / 100 : (videoRef.current?.volume ?? settings.volume)),
      startX: touch.clientX,
      moved: false,
    };
    lastNativeBrightnessRef.current = -1;
    lastNativeVolumeRef.current = -1;
  };

  const onLiveTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    const touch = event.touches[0];
    if (!gesture || !touch) return;
    if (!gesture.moved && (Math.abs(touch.clientX - gesture.startX) > 8 || Math.abs(touch.clientY - gesture.startY) > 8)) {
      gesture.moved = true;
    }
    if (!gesture.moved) return;
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

  const onLiveTouchEnd = () => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture || !gesture.moved) return;
    if (gesture.kind === 'volume' && !androidMediaBridge) {
      updateSettings({ volume: videoRef.current?.volume ?? settings.volume });
    }
  };

  /* Android 前台服务：直播后台播放、播放通知与进度 */
  useEffect(() => {
    if (device !== 'android' || !isTauri() || !selected) return;
    const send = () => {
      const video = videoRef.current;
      const position = video && Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const duration = video && Number.isFinite(video.duration) ? video.duration : 0;
      updateAndroidPlayback(selected.name, selected.group || source.name, playing, position, duration);
    };
    send();
    if (!playing) return;
    const timer = window.setInterval(send, 2000);
    return () => window.clearInterval(timer);
  }, [device, selected, playing, source.name]);

  useEffect(() => {
    if (device !== 'android' || !isTauri()) return;
    return () => stopAndroidPlayback();
  }, [device]);

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
        if (video && selected?.url) {
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
  }, [device, selected?.url]);

  return (
    <div className={`live-page ${cssFullscreen ? 'is-css-fullscreen' : ''} ${rotateLandscape ? 'is-landscape-rotate' : ''}`}>
      <div className="live-head">
        <div>
          <div className="page-kicker"><i className="live-dot" />LIVE · {sources.length} 个直播源</div>
          <h1>直播</h1>
          <p>频道分组、搜索与 HLS 播放，取流走 Tauri 原生通道。</p>
        </div>
        <div className="live-head-actions">
          <Button size="sm" variant="ghost" icon="refresh" onClick={() => { setReloadKey((value) => value + 1); toast(`正在刷新 ${source.name}`, 'success'); }}>
            刷新频道
          </Button>
        </div>
      </div>

      <div className="live-source-tabs">
        {sources.map((item, index) => (
          <button
            type="button"
            key={item.key}
            className={`live-source-tab ${index === sourceIndex ? 'is-active' : ''}`}
            onClick={() => switchSource(index)}
          >
            <span>{item.name}</span>
            <small>{index === sourceIndex && loaded.length ? loaded.length : item.count}</small>
          </button>
        ))}
      </div>

      <div className="live-status-line">
        {loading ? <><Icon name="refresh" size={13} /> 正在解析 {source.name} …</> : null}
        {!loading && usingFallback && (
          <><Icon name="wifi" size={13} /> {error ? `加载失败（${error}），已显示示例频道` : '浏览器预览：显示示例频道，客户端内为真实频道'}</>
        )}
        {!loading && !usingFallback && !loaded.length ? (
          <><Icon name="wifi" size={13} /> {error ? `加载失败（${error}）` : '该源暂无频道，试试其他直播源'}</>
        ) : null}
        {!loading && loaded.length ? <><Icon name="check" size={13} /> 已加载 {loaded.length} 个频道 · {groups.length - 1} 个分组</> : null}
      </div>

      <div className="live-layout">
        <section className="live-player-column">
          <div
            className={`live-screen ${playing ? 'is-playing' : ''}`}
            style={{ '--h': hue } as CSSProperties}
          >
            <div className="live-screen-bg" />
            <div className="live-screen-glow" />
            <video
              ref={videoRef}
              className={`video-el ${selected?.url ? '' : 'is-hidden'}`}
              playsInline
              style={{ filter: !androidMediaBridge && brightness !== 1 ? `brightness(${brightness})` : undefined }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onError={() => {
                if (hlsRef.current) return;
                const reason = '频道播放失败';
                setPlayerError(reason);
                if (selected) failoverHandlerRef.current(selected, reason);
              }}
            />
            <div
              className="live-gesture-layer"
              aria-hidden="true"
              onTouchStart={onLiveTouchStart}
              onTouchMove={onLiveTouchMove}
              onTouchEnd={onLiveTouchEnd}
              onTouchCancel={onLiveTouchEnd}
            />
            <div className="live-screen-top">
              <span className="live-badge"><i className="live-dot" />LIVE</span>
              <span>{selected?.group || '未分组'} · {source.name}</span>
            </div>
            {!selected?.url && (
              <div className="live-screen-center">
                <span className="live-screen-mark">{selected?.name.slice(0, 1) || 'L'}</span>
                <h2>{selected?.name || '选择频道'}</h2>
                <p>{playing ? '正在直播 · 演示画面' : '已暂停'}</p>
              </div>
            )}
            {playerError && (
              <div className="video-error">
                <span>{playerError}</span>
                <button
                  type="button"
                  onClick={() => {
                    failoverRef.current = false;
                    failoverTokenRef.current += 1;
                    setPlayerError(null);
                    setRetryKey((value) => value + 1);
                  }}
                >
                  重试
                </button>
              </div>
            )}
            {gestureHud && (
              <div className="player-gesture-hud" aria-hidden="true">
                <Icon name={gestureHud.kind === 'brightness' ? 'sun' : 'volume'} size={20} />
                <strong>{Math.round(gestureHud.value * 100)}%</strong>
                <span>{gestureHud.kind === 'brightness' ? '亮度' : '音量'}</span>
              </div>
            )}
            <div className="live-screen-controls">
              <button type="button" onClick={togglePlay} aria-label={playing ? '暂停' : '播放'}>
                <Icon name={playing ? 'pause' : 'play'} size={20} />
              </button>
              <div className="live-wave">
                {Array.from({ length: 26 }, (_, index) => <i key={index} style={{ height: `${8 + ((index * 7) % 22)}px` }} />)}
              </div>
              <button type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? '取消静音' : '静音'}><Icon name="volume" size={18} /></button>
              {(castSupported || device === 'android') && (
                <button
                  type="button"
                  aria-label="投屏"
                  onClick={async () => {
                    const video = videoRef.current as (HTMLVideoElement & { remote?: { prompt: () => Promise<void> } }) | null;
                    if (device === 'android') {
                      if (!selected?.url) {
                        toast('请先选择可播放的频道', 'warning');
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
                  <Icon name="wifi" size={18} />
                </button>
              )}
              <button type="button" onClick={toggleFullscreen} aria-label={cssFullscreen ? '退出全屏' : '全屏'}><Icon name="fullscreen" size={18} /></button>
            </div>
          </div>
          <div className="live-now">
            <div>
              <span className="live-now-kicker">正在播放</span>
              <h3>
                {selected?.name || '未选择'}
                {selected && (
                  <button
                    type="button"
                    className={`live-fav ${selectedFavorite ? 'is-on' : ''}`}
                    onClick={toggleFavoriteChannel}
                    aria-label={selectedFavorite ? '取消收藏' : '收藏频道'}
                  >
                    <Icon name="heart" size={15} />
                  </button>
                )}
              </h3>
              <p>频道分组：{selected?.group || '-'} · 来源：{source.name}</p>
            </div>
            <div className="live-epg">
              <div className="live-epg-head">
                <span>节目单</span>
                <div className="live-epg-days">
                  <Chip active={epgDay === 0} onClick={() => setEpgDay(0)}>今天</Chip>
                  <Chip active={epgDay === 1} onClick={() => setEpgDay(1)}>明天</Chip>
                </div>
              </div>
              {epg.loading ? (
                <small>正在加载节目单…</small>
              ) : epg.data ? (
                <>
                  <strong>
                    {programNow
                      ? `正在播：${programNow.title}（${programNow.start}–${programNow.end}）`
                      : programNext
                        ? `下一档：${programNext.title}（${programNext.start}）`
                        : `${epg.data.channelName} · ${epg.data.programs.length} 个节目`}
                  </strong>
                  <div className="live-epg-list">
                    {epg.data.programs.slice(0, 48).map((program, index) => (
                      <div
                        key={`${program.start}-${index}`}
                        className={`live-epg-item ${program === programNow ? 'is-current' : ''}`}
                      >
                        <span>{program.start}</span>
                        <span>{program.title}</span>
                        {isFutureProgram(program) && (
                          <button
                            type="button"
                            className={`live-epg-remind ${isProgramReminded(program) ? 'is-on' : ''}`}
                            onClick={() => toggleProgramReminder(program)}
                            aria-label={isProgramReminded(program) ? '取消节目提醒' : '设置节目提醒'}
                          >
                            <Icon name="bell" size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <small>{epg.error || '该频道暂无节目单'}</small>
              )}
            </div>
          </div>
        </section>

        <aside className="live-channel-panel">
          <div className="live-channel-head">
            <div>
              <h3>{showRecent ? '最近观看' : source.name}</h3>
              <p>{showRecent ? `${recent.length} 条跨源记录` : `${list.length} 个频道${usingFallback ? '（示例）' : ' · 解析自公开 M3U'}`}</p>
            </div>
            <span className="live-count">{showRecent ? recentFiltered.length : filtered.length}</span>
          </div>
          <div className="live-search">
            <Icon name="search" size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索频道或分组" />
          </div>
          <div className="live-groups">
            <Chip active={showRecent} onClick={() => { setShowRecent(true); setShowFavorites(false); setGroup('全部'); }}>
              最近 {recent.length}
            </Chip>
            <Chip active={showFavorites} onClick={() => { setShowFavorites(true); setShowRecent(false); setGroup('全部'); }}>
              收藏 {favoriteSet.size}
            </Chip>
            {groups.map((item) => (
              <Chip
                key={item}
                active={!showFavorites && !showRecent && group === item}
                onClick={() => { setShowFavorites(false); setShowRecent(false); setGroup(item); }}
              >
                {item}
              </Chip>
            ))}
          </div>
          {showRecent ? (
            <div className="live-recent-grid">
              {recentFiltered.map((entry) => (
                <button type="button" key={entry.key} className="live-channel-card" onClick={() => openRecent(entry)}>
                  <ChannelLogo name={entry.name} logo={entry.logo} />
                  <span className="live-channel-name">{entry.name}</span>
                  <small>{entry.group} · {entry.sourceName || sourceNameOf(entry.sourceKey)}</small>
                  <i className="live-channel-playing"><Icon name="play" size={11} /></i>
                </button>
              ))}
              {!recentFiltered.length && <div className="live-empty">还没有最近观看记录，播放频道后会自动出现在这里</div>}
            </div>
          ) : (
            <div className="live-channel-grid">
              {filtered.map((channel) => (
                <button
                  type="button"
                  key={channel.id}
                  className={`live-channel-card ${selected?.id === channel.id ? 'is-active' : ''}`}
                  onClick={() => selectChannel(channel)}
                >
                  <ChannelLogo name={channel.name} logo={channel.logo} />
                  <span className="live-channel-name">{channel.name}</span>
                  <small>{channel.group}</small>
                  {selected?.id === channel.id && <i className="live-channel-playing"><Icon name="play" size={11} /></i>}
                </button>
              ))}
            </div>
          )}
          {!showRecent && !filtered.length && (
            <div className="live-empty">{showFavorites ? '还没有收藏频道，选中频道后点心形收藏' : '没有匹配的频道'}</div>
          )}
        </aside>
      </div>
      <CastSheet
        open={castOpen}
        url={selected?.url || ''}
        title={selected?.name || '直播'}
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