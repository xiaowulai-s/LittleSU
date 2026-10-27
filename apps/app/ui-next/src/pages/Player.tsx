import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Episode, Title } from '../data';
import { Icon } from '../icons';
import { useApp } from '../store';
import { historyToTitle } from '../lib/adapters';
import { useDetail } from '../lib/hooks';
import { hlsConfigWithNativeLoader } from '../lib/hlsNativeLoader';
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

  const episodes = useMemo<Episode[]>(() => {
    if (!title) return [];
    if (title.episodesList?.length) return title.episodesList;
    if (title.playUrl) return [{ name: '正片', url: title.playUrl }];
    return mockEpisodes(title);
  }, [title]);

  const [episode, setEpisode] = useState(() => (historyRecord?.episodeIndex ?? 0) + 1);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [playableUrl, setPlayableUrl] = useState('');
  const [resolving, setResolving] = useState(false);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreenState] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const triedNextRef = useRef<(reason: string) => boolean>(() => false);
  const fullscreenRef = useRef<() => void>(() => undefined);

  const current = episodes[episode - 1];
  const sourceUrl = current?.url || '';
  const streamUrl = playableUrl || (/\.m3u8/i.test(sourceUrl) ? sourceUrl : '');
  const isMock = !streamUrl && !resolving;
  const isFavorite = favoriteKeys.has(rawKey);
  const key = rawKey;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawKey]);

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
    setProgress(0);
    setCurrentTime(0);
    setPlaying(true);
    toast(`已自动切换到 ${next.sourceName}`, 'success');
    window.setTimeout(() => setSwitching(false), 1500);
    return true;
  }, [title, uniqueVariants, settings.autoSwitchSource, toast]);

  useEffect(() => {
    triedNextRef.current = tryNextVariant;
  }, [tryNextVariant]);

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

    const globalHls = (window as unknown as {
      Hls?: { isSupported: () => boolean; Events: { ERROR: string } };
    }).Hls;
    if (globalHls?.isSupported()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hls = new (globalHls as any)(hlsConfigWithNativeLoader(settings.adFilter));
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(globalHls.Events.ERROR, (_event: unknown, data: { fatal?: boolean; details?: string }) => {
        if (!data?.fatal) return;
        const handled = triedNextRef.current(data.details || '播放失败');
        if (!handled) setVideoError(data.details || '播放失败');
      });
      hlsRef.current = hls as { destroy: () => void };
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
  }, [streamUrl, settings.adFilter, resolving]);

  /* ---------- 音量 ---------- */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = muted ? 0 : settings.volume;
    video.muted = muted;
  }, [streamUrl, settings.volume, muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl || !settings.remember) return;
    const onLoaded = () => {
      if (historyRecord?.position && historyRecord.position > 10) {
        video.currentTime = historyRecord.position;
        toast(`已恢复到 ${formatTime(historyRecord.position)}`, 'success');
      }
    };
    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    return () => video.removeEventListener('loadedmetadata', onLoaded);
  }, [streamUrl, settings.remember, historyRecord?.position, toast]);

  const persistHistory = useCallback(() => {
    if (!title) return;
    const video = videoRef.current;
    const position = isMock ? currentTime : video?.currentTime ?? 0;
    const total = isMock ? (title.type === '电影' ? 7200 : 2700) : video?.duration ?? 0;
    recordHistory({
      key,
      name: title.name,
      poster: title.poster,
      sourceName: title.source,
      sourceKey: title.sourceKey,
      vodId: title.vodId,
      playUrl: streamUrl || title.playUrl,
      episodeName: current?.name,
      episodeIndex: episode - 1,
      position,
      duration: total,
      timestamp: Date.now(),
      progress: total > 0 ? Math.min(100, Math.round((position / total) * 100)) : 0,
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
    const ok = await setFullscreen(next);
    if (!ok) {
      toast('当前环境不支持全屏', 'warning');
      return;
    }
    setFullscreenState(next);
  }, [fullscreen, toast]);

  useEffect(() => {
    fullscreenRef.current = () => { void toggleFullscreen(); };
  }, [toggleFullscreen]);

  useEffect(() => () => {
    if (fullscreen) void setFullscreen(false);
  }, [fullscreen]);

  /* ---------- 键盘快捷键 ---------- */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
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
      if (event.key.toLowerCase() === 'f') fullscreenRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMock]);

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

  const switchEpisode = (index: number) => {
    setEpisode(index + 1);
    setCurrentTime(0);
    setProgress(0);
    setPlaying(true);
    toast(`正在播放 ${episodes[index]?.name || `第 ${index + 1} 集`}`);
  };

  const switchToVariant = (variant: { sourceKey: string; sourceName: string; vodId: string }) => {
    if (!title) return;
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
    setProgress(0);
    setCurrentTime(0);
    setPlaying(true);
    setVideoError(null);
    toast(`已切换到 ${variant.sourceName}`, 'success');
  };

  const totalSeconds = isMock ? (title.type === '电影' ? 7200 : 2700) : duration;
  const displayTime = isMock ? currentTime : progress > 0 ? (progress / 100) * duration : 0;
  const activeVariantKey = `${title.sourceKey || ''}:${title.vodId || ''}`;
  const statusText = switching || detailLoading ? '切换源中…' : isMock ? '演示播放' : '原生取流';

  return (
    <div className="player-page">
      <header className="player-topbar">
        <button type="button" className="player-back" onClick={() => navigate(-1)} aria-label="返回">
          <Icon name="back" size={19} />
        </button>
        <div className="player-topbar-title">
          <strong>{title.name}</strong>
          <span>{current?.name || '正片'} · {title.source} · {title.quality} · {statusText}</span>
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
          <div className="video-surface" style={{ '--h': title.hue } as CSSProperties}>
            <div className="video-bg" />
            <div className="video-glow" />
            <div className="video-grain" />
            <video
              ref={videoRef}
              className={`video-el ${isMock ? 'is-hidden' : ''}`}
              playsInline
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
            {videoError && <div className="video-error">{videoError}</div>}
            <div className="video-controls">
              <button type="button" onClick={togglePlay} aria-label={playing ? '暂停' : '播放'}>
                <Icon name={playing ? 'pause' : 'play'} size={19} />
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
              <span className="video-time">{formatTime(totalSeconds)}</span>
              <button type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? '取消静音' : '静音'}>
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
                onClick={() => {
                  const next = (speedIndex + 1) % speeds.length;
                  setSpeedIndex(next);
                  if (videoRef.current) videoRef.current.playbackRate = speeds[next];
                }}
              >
                {speeds[speedIndex]}x
              </button>
              <button type="button" onClick={() => { void toggleFullscreen(); }} aria-label={fullscreen ? '退出全屏' : '全屏'}>
                <Icon name="fullscreen" size={18} />
              </button>
            </div>
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
                <Button size="sm" variant="ghost" icon="external" onClick={() => toast('已复制分享链接（原型）', 'success')}>分享</Button>
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
    </div>
  );
}