import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { titles as mockTitles } from './data';
import type { Title } from './data';
import { Icon } from './icons';
import { useApp } from './store';
import { historyToTitle } from './lib/adapters';
import { useDetail } from './lib/hooks';
import { cacheTitle } from './lib/titleCache';
import { Button, Poster, Rating, SectionHeader } from './ui';

function episodesOf(count: number, type: string) {
  if (type === '电影') return ['正片'];
  return Array.from({ length: Math.min(count || 24, 30) }, (_, index) => `第 ${index + 1} 集`);
}

export function DetailView({ titleKey, inDrawer = false }: { titleKey: string; inDrawer?: boolean }) {
  const navigate = useNavigate();
  const { favoriteKeys, toggleFavorite, toast, closeDrawer, getTitle, history, health } = useApp();
  const [variantKey, setVariantKey] = useState<string | null>(null);

  const cached: Title | undefined = useMemo(() => {
    const found = getTitle(titleKey);
    if (found) return found;
    const record = history.find((item) => item.key === titleKey);
    return record ? historyToTitle(record) : undefined;
  }, [titleKey, getTitle, history]);

  /** 选中其他源时以变体信息重建基础 Title，再交给 useDetail 拉取该源详情 */
  const base = useMemo<Title | undefined>(() => {
    if (!cached || !variantKey) return cached;
    const variant = cached.variants?.find((item) => `${item.sourceKey}:${item.vodId}` === variantKey);
    if (!variant) return cached;
    return {
      ...cached,
      key: variantKey,
      id: variantKey,
      source: variant.sourceName,
      sourceKey: variant.sourceKey,
      vodId: variant.vodId,
      episodesList: undefined,
      playUrl: undefined,
    };
  }, [cached, variantKey]);

  const { title: fetched, loading, error } = useDetail(base);
  const title = fetched ?? base;

  if (!title) {
    return <div className="detail-empty">没有找到这个条目</div>;
  }

  const key = title.key ?? title.id;
  const isFavorite = favoriteKeys.has(key);
  const episodes = title.episodesList?.length
    ? title.episodesList.map((episode) => episode.name)
    : episodesOf(title.episodes, title.type);
  const related = mockTitles
    .filter((item) => item.id !== title.id && (item.type === title.type || item.genres[0] === title.genres[0]))
    .slice(0, 6);
  const currentSourceKey = title.sourceKey && title.vodId ? `${title.sourceKey}:${title.vodId}` : key;
  const sourceOptions = useMemo(() => {
    const map = new Map<string, { key: string; name: string; sourceKey: string }>();
    (title.variants ?? []).forEach((variant) => {
      const variantId = `${variant.sourceKey}:${variant.vodId}`;
      if (!map.has(variantId)) {
        map.set(variantId, { key: variantId, name: variant.sourceName, sourceKey: variant.sourceKey });
      }
    });
    if (!map.size) map.set(currentSourceKey, { key: currentSourceKey, name: title.source, sourceKey: title.sourceKey ?? '' });
    return Array.from(map.values());
  }, [title, currentSourceKey]);

  const play = () => {
    cacheTitle(title);
    navigate(`/player/${encodeURIComponent(key)}`);
  };

  const switchSource = (option: { key: string; name: string; sourceKey: string }) => {
    if (option.key === currentSourceKey) {
      toast(`正在使用 ${option.name}`);
      return;
    }
    setVariantKey(option.key);
    toast(`正在切换到 ${option.name}`, 'success');
  };

  return (
    <div className={`detail ${inDrawer ? 'detail-in-drawer' : 'detail-page'}`}>
      <div className="detail-hero" style={{ '--h': title.hue } as CSSProperties}>
        {title.poster ? (
          <img className="detail-hero-poster" src={title.poster} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
        ) : null}
        <div className="detail-hero-glow" />
        {inDrawer && (
          <button type="button" className="detail-close" onClick={closeDrawer} aria-label="关闭">
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
      <div className="detail-content">
        <div className="detail-head">
          <div className="detail-poster" style={{ '--h': title.hue } as CSSProperties}>
            {title.poster
              ? <img src={title.poster} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
              : <span>{title.name.slice(0, 1)}</span>}
            <small>{title.en || title.type}</small>
          </div>
          <div className="detail-title-block">
            <div className="detail-kicker">
              {title.badge || title.type}
              {title.region ? ` · ${title.region}` : ''}
              {title.sources?.length ? ` · ${title.sources.length} 个源` : ''}
            </div>
            <h1>{title.name}</h1>
            <div className="detail-meta">
              {title.rating > 0 && <Rating value={title.rating} />}
              {title.year > 0 && <span>{title.year}</span>}
              <span>{title.quality}</span>
              {title.duration ? <span>{title.duration}</span> : null}
              {loading ? <span className="detail-loading">正在获取详情…</span> : null}
            </div>
            <div className="detail-genres">
              {title.genres.map((genre) => <span key={genre}>{genre}</span>)}
            </div>
            <p className="detail-synopsis">{title.synopsis}</p>
            {title.note ? <p className="detail-note">{title.note}</p> : null}
            {error ? <p className="detail-note detail-note-error">详情获取失败：{error}</p> : null}
            <div className="detail-actions">
              <Button variant="primary" size="md" icon="play" onClick={play}>立即播放</Button>
              <Button
                variant={isFavorite ? 'secondary' : 'ghost'}
                size="md"
                icon="heart"
                onClick={() => {
                  toggleFavorite(title);
                  toast(isFavorite ? '已取消收藏' : `已收藏《${title.name}》`, 'success');
                }}
              >
                {isFavorite ? '已收藏' : '收藏'}
              </Button>
              <Button variant="ghost" size="md" icon="external" onClick={() => toast('已复制分享链接（原型）', 'success')}>
                分享
              </Button>
            </div>
          </div>
        </div>

        <section className="detail-section">
          <SectionHeader
            title="播放源"
            subtitle={sourceOptions.length > 1 ? `共 ${sourceOptions.length} 个源，点击切换` : '可用源默认优先，失败可手动切换'}
          />
          <div className="source-options">
            {sourceOptions.map((option) => {
              const probe = health[option.sourceKey];
              const active = option.key === currentSourceKey;
              return (
                <button
                  type="button"
                  key={option.key}
                  className={`source-option ${active ? 'is-active' : ''}`}
                  onClick={() => switchSource(option)}
                >
                  <span className="source-option-name">{option.name}</span>
                  <span className="source-option-meta">
                    {active && loading
                      ? '获取详情中…'
                      : probe
                        ? probe.status === 'ok' ? `${probe.latency}ms` : '测活失败'
                        : active ? title.quality : '未测活'}
                  </span>
                  <i className={`status-dot ${probe?.status === 'fail' ? 'status-experimental' : 'status-ok'}`} />
                </button>
              );
            })}
          </div>
        </section>

        <section className="detail-section">
          <SectionHeader
            title="选集"
            subtitle={`${episodes.length}${title.type === '电影' ? '' : ' 集'} · ${loading ? '加载中' : '自动连播'}`}
          />
          <div className="episode-grid">
            {episodes.map((episode, index) => (
              <button
                type="button"
                key={`${episode}-${index}`}
                className={`episode ${index === 0 ? 'is-active' : ''}`}
                onClick={play}
              >
                {episode}
              </button>
            ))}
          </div>
          {title.episodes > 30 && (
            <button type="button" className="text-link" onClick={play}>查看全部 {title.episodes} 集</button>
          )}
        </section>

        <section className="detail-section">
          <SectionHeader title="相关推荐" actionLabel="更多" onAction={() => navigate('/search')} />
          <div className="detail-related">
            {related.map((item) => <Poster key={item.id} title={item} size="small" />)}
          </div>
        </section>
      </div>
    </div>
  );
}

export function DetailDrawer() {
  const { drawerId, closeDrawer } = useApp();
  useEffect(() => {
    if (!drawerId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerId, closeDrawer]);

  if (!drawerId) return null;
  return (
    <div className="drawer-layer" role="dialog" aria-modal="true">
      <button type="button" className="drawer-scrim" aria-label="关闭详情" onClick={closeDrawer} />
      <aside className="detail-drawer">
        <button type="button" className="drawer-close" onClick={closeDrawer} aria-label="关闭">
          <Icon name="close" size={18} />
        </button>
        <DetailView titleKey={drawerId} inDrawer />
      </aside>
    </div>
  );
}

export function DetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const key = id ? decodeURIComponent(id) : '';
  return (
    <div className="mobile-detail-page">
      <header className="mobile-page-header">
        <button type="button" className="back-btn" onClick={() => navigate(-1)} aria-label="返回">
          <Icon name="back" size={19} />
        </button>
        <span>详情</span>
        <span className="mobile-page-spacer" />
      </header>
      <DetailView titleKey={key} />
    </div>
  );
}