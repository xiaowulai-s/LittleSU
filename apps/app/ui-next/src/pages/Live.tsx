import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Hls from 'hls.js';
import { channels as mockChannelData, liveSources } from '../data';
import { Icon } from '../icons';
import { useApp } from '../store';
import { hashHue } from '../lib/adapters';
import { groupChannels } from '../lib/liveParser';
import type { LiveChannel } from '../lib/liveParser';
import { hlsConfigWithNativeLoader } from '../lib/hlsNativeLoader';
import { useLivePlaylist, useEpg } from '../lib/hooks';
import { currentProgram, epgDate, nextProgram } from '../lib/epg';
import { Button, Chip } from '../ui';

const fallbackChannels: LiveChannel[] = mockChannelData.map((channel) => ({
  id: channel.id,
  name: channel.name,
  group: channel.group,
  url: '',
  logo: '',
  tvgId: '',
}));

export default function Live() {
  const { toast } = useApp();
  const [sourceIndex, setSourceIndex] = useState(0);
  const [group, setGroup] = useState('全部');
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const source = liveSources[sourceIndex];
  const { loading, channels: loaded, error } = useLivePlaylist(source.url, reloadKey);
  const list = loaded.length ? loaded : fallbackChannels;
  const [selectedId, setSelectedId] = useState<string>('');
  const [epgDay, setEpgDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [cssFullscreen, setCssFullscreen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const selected = list.find((channel) => channel.id === selectedId) ?? list[0];
  const epgDateStr = useMemo(() => epgDate(epgDay), [epgDay]);
  const epg = useEpg(selected, epgDateStr);
  const programNow = epgDay === 0 && epg.data ? currentProgram(epg.data.programs) : undefined;
  const programNext = epg.data ? nextProgram(epg.data.programs) : undefined;

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
    if (!list.length) return;
    setSelectedId((current) => (list.some((channel) => channel.id === current) ? current : list[0].id));
    setGroup('全部');
  }, [list]);

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
        if (data?.fatal) setPlayerError(data.details || '频道播放失败');
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
  }, [selected?.url, selected?.id]);

  const groups = useMemo(() => groupChannels(list), [list]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return list.filter((channel) => {
      if (group !== '全部' && channel.group !== group) return false;
      if (text && !`${channel.name} ${channel.group}`.toLowerCase().includes(text)) return false;
      return true;
    });
  }, [list, group, query]);

  const hue = selected ? hashHue(selected.name) : 210;
  const usingFallback = !loaded.length;

  const switchSource = (index: number) => {
    setSourceIndex(index);
    setGroup('全部');
    setQuery('');
    toast(`已切换到 ${liveSources[index].name}`, 'success');
  };

  const selectChannel = (channel: LiveChannel) => {
    setSelectedId(channel.id);
    setPlaying(true);
    toast(`正在播放 ${channel.name}`);
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

  return (
    <div className={`live-page ${cssFullscreen ? 'is-css-fullscreen' : ''}`}>
      <div className="live-head">
        <div>
          <div className="page-kicker"><i className="live-dot" />LIVE · 5 个内置直播源</div>
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
        {liveSources.map((item, index) => (
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
        {!loading && !usingFallback ? <><Icon name="check" size={13} /> 已加载 {loaded.length} 个频道 · {groups.length - 1} 个分组</> : null}
      </div>

      <div className="live-layout">
        <section className="live-player-column">
          <div className={`live-screen ${playing ? 'is-playing' : ''}`} style={{ '--h': hue } as CSSProperties}>
            <div className="live-screen-bg" />
            <div className="live-screen-glow" />
            <video
              ref={videoRef}
              className={`video-el ${selected?.url ? '' : 'is-hidden'}`}
              playsInline
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
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
            {playerError && <div className="video-error">{playerError}</div>}
            <div className="live-screen-controls">
              <button type="button" onClick={togglePlay} aria-label={playing ? '暂停' : '播放'}>
                <Icon name={playing ? 'pause' : 'play'} size={20} />
              </button>
              <div className="live-wave">
                {Array.from({ length: 26 }, (_, index) => <i key={index} style={{ height: `${8 + ((index * 7) % 22)}px` }} />)}
              </div>
              <button type="button" onClick={() => toast('音量控制将在实现阶段接入')} aria-label="音量"><Icon name="volume" size={18} /></button>
              <button type="button" onClick={() => setCssFullscreen((value) => !value)} aria-label={cssFullscreen ? '退出全屏' : '全屏'}><Icon name="fullscreen" size={18} /></button>
            </div>
          </div>
          <div className="live-now">
            <div>
              <span className="live-now-kicker">正在播放</span>
              <h3>{selected?.name || '未选择'}</h3>
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
              <h3>{source.name}</h3>
              <p>{list.length} 个频道{usingFallback ? '（示例）' : ' · 解析自公开 M3U'}</p>
            </div>
            <span className="live-count">{filtered.length}</span>
          </div>
          <div className="live-search">
            <Icon name="search" size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索频道或分组" />
          </div>
          <div className="live-groups">
            {groups.map((item) => <Chip key={item} active={group === item} onClick={() => setGroup(item)}>{item}</Chip>)}
          </div>
          <div className="live-channel-grid">
            {filtered.map((channel) => (
              <button
                type="button"
                key={channel.id}
                className={`live-channel-card ${selected?.id === channel.id ? 'is-active' : ''}`}
                onClick={() => selectChannel(channel)}
              >
                <span className="live-channel-logo" style={{ '--h': hashHue(channel.name) } as CSSProperties}>{channel.name.slice(0, 1)}</span>
                <span className="live-channel-name">{channel.name}</span>
                <small>{channel.group}</small>
                {selected?.id === channel.id && <i className="live-channel-playing"><Icon name="play" size={11} /></i>}
              </button>
            ))}
          </div>
          {!filtered.length && <div className="live-empty">没有匹配的频道</div>}
        </aside>
      </div>
    </div>
  );
}