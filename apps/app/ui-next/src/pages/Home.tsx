import { useNavigate } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { channels, historyItems, titles as mockTitles } from '../data';
import type { Title } from '../data';
import { Icon } from '../icons';
import { useApp } from '../store';
import { favoriteToTitle, historyToTitle } from '../lib/adapters';
import { useHomeFeed } from '../lib/hooks';
import { Button, EmptyState, Rail, Rating } from '../ui';

export default function Home() {
  const navigate = useNavigate();
  const { openTitle, favoriteKeys, toggleFavorite, toast, history, favorites, sourceState, customApis } = useApp();
  const feed = useHomeFeed();

  const items: Title[] = feed.items.length ? feed.items : mockTitles;
  const hero: Title = items.find((item) => item.badge) ?? items[0];

  const continueTitles = history.length
    ? history.slice(0, 5).map((record) => historyToTitle(record))
    : historyItems.map((item) => mockTitles.find((t) => t.id === item.titleId)).filter((t): t is Title => Boolean(t));
  const continueMap: Record<string, number> = history.length
    ? Object.fromEntries(history.slice(0, 5).map((record) => [record.key, record.progress]))
    : Object.fromEntries(historyItems.map((item) => [item.titleId, item.progress]));
  const continueNotes: Record<string, string> = history.length
    ? Object.fromEntries(
        history.slice(0, 5).map((record) => [
          record.key,
          `${record.episodeName || `第 ${(record.episodeIndex ?? 0) + 1} 集`} · ${new Date(record.timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
        ]),
      )
    : Object.fromEntries(historyItems.map((item) => [item.titleId, `${item.episode} · ${item.watchedAt}`]));

  const movies = items.filter((item) => item.type === '电影' || item.type === '动画');
  const series = items.filter((item) => item.type === '剧集');
  const topRated = [...items].filter((item) => item.rating > 0).sort((a, b) => b.rating - a.rating).slice(0, 10);
  const favoriteTitles = favorites.slice(0, 10).map((record) => favoriteToTitle(record));
  const heroKey = hero.key ?? hero.id;
  const isFavorite = favoriteKeys.has(heroKey);
  const enabledCount = Object.values(sourceState).filter(Boolean).length + customApis.length;

  return (
    <div className="home-page">
      <section className="hero" style={{ '--h': hero.hue } as CSSProperties}>
        <div className="hero-bg" />
        {hero.poster ? (
          <img className="hero-poster" src={hero.poster} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
        ) : null}
        <div className="hero-glow hero-glow-a" />
        <div className="hero-glow hero-glow-b" />
        <div className="hero-mark">{hero.name.slice(0, 1)}</div>
        <div className="hero-content">
          <div className="hero-kicker">
            <span className="hero-live-dot" />
            {hero.badge || (feed.real ? '最新上架' : '本周精选')} · {hero.type} · {hero.year || ''}
            {feed.real ? <em className="hero-real">实时</em> : null}
          </div>
          <h1>{hero.name}</h1>
          <p className="hero-en">{hero.en || hero.genres.join(' / ')}</p>
          <div className="hero-meta">
            {hero.rating > 0 && <Rating value={hero.rating} />}
            <span>{hero.quality}</span>
            {hero.region ? <span>{hero.region}</span> : null}
            {hero.sources?.length ? <span>{hero.sources.slice(0, 3).join(' / ')}</span> : null}
          </div>
          <p className="hero-synopsis">{hero.synopsis}</p>
          <div className="hero-actions">
            <Button variant="primary" size="lg" icon="play" onClick={() => navigate(`/player/${encodeURIComponent(heroKey)}`)}>立即播放</Button>
            <Button variant="secondary" size="lg" icon="more" onClick={() => openTitle(heroKey)}>查看详情</Button>
            <Button
              variant="ghost"
              size="lg"
              icon="heart"
              onClick={() => {
                toggleFavorite(hero);
                toast(isFavorite ? '已取消收藏' : `已收藏《${hero.name}》`, 'success');
              }}
            >
              {isFavorite ? '已收藏' : '收藏'}
            </Button>
          </div>
        </div>
        <div className="hero-side">
          <div className="hero-side-label">{feed.real ? `来自 ${enabledCount} 个源` : '今日推荐'}</div>
          <div className="hero-side-list">
            {items.slice(1, 4).map((item) => (
              <button type="button" key={item.key ?? item.id} className="hero-side-item" onClick={() => openTitle(item.key ?? item.id)}>
                <span className="hero-side-thumb" style={{ '--h': item.hue } as CSSProperties}>
                  {item.poster
                    ? <img src={item.poster} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                    : item.name.slice(0, 1)}
                </span>
                <span className="hero-side-text">
                  <strong>{item.name}</strong>
                  <small>{item.type} · {item.year || ''}</small>
                </span>
                <Icon name="chevronRight" size={15} />
              </button>
            ))}
          </div>
        </div>
      </section>

      <button type="button" className="mobile-search-entry" onClick={() => navigate('/search')}>
        <Icon name="search" size={18} />
        <span>搜索片名、演员或类型</span>
        <span className="mobile-search-chip">搜索</span>
      </button>

      {continueTitles.length > 0 && (
        <Rail
          title="继续观看"
          subtitle="从上次停下的地方继续"
          items={continueTitles}
          actionLabel="全部历史"
          onAction={() => navigate('/history')}
          progressMap={continueMap}
          noteMap={continueNotes}
        />
      )}
      {movies.length > 0 && (
        <Rail
          title="热门电影"
          subtitle={feed.real ? '来自推荐源的最新内容' : '正在被更多人观看'}
          items={movies}
          actionLabel="查看更多"
          onAction={() => navigate('/search?q=电影')}
        />
      )}
      {series.length > 0 && <Rail title="热门剧集" subtitle="本周讨论度最高" items={series} actionLabel="查看更多" onAction={() => navigate('/search?q=剧集')} />}
      {topRated.length > 0 && <Rail title="高分精选" subtitle="按评分排序" items={topRated} actionLabel="完整榜单" onAction={() => navigate('/search?q=Top250')} />}
      {favoriteTitles.length > 0 && (
        <Rail title="我的收藏" subtitle="你标记过的内容" items={favoriteTitles} actionLabel="管理收藏" onAction={() => navigate('/favorites')} />
      )}
      {favoriteTitles.length === 0 && (
        <div className="home-empty-rail">
          <EmptyState icon="heart" title="还没有收藏" description="在影片卡片上点击心形即可收藏。" />
        </div>
      )}

      <section className="rail-section live-preview-section">
        <div className="section-header">
          <div>
            <h2>直播精选</h2>
            <p>5 个内置直播源 · 原生取流</p>
          </div>
          <button type="button" className="section-action" onClick={() => navigate('/live')}>
            进入直播
            <Icon name="chevronRight" size={15} />
          </button>
        </div>
        <div className="live-preview-grid">
          {channels.slice(0, 4).map((channel) => (
            <button
              type="button"
              key={channel.id}
              className="live-preview-card"
              style={{ '--h': channel.hue } as CSSProperties}
              onClick={() => navigate('/live')}
            >
              <span className="live-preview-glow" />
              <span className="live-preview-kicker"><i className="live-dot" />LIVE</span>
              <strong>{channel.name}</strong>
              <small>{channel.group} · {channel.source}</small>
              <span className="live-preview-play"><Icon name="play" size={18} /></span>
            </button>
          ))}
        </div>
      </section>

      {feed.loading && <div className="feed-loading"><Icon name="refresh" size={15} /> 正在从推荐源加载最新内容…</div>}
    </div>
  );
}