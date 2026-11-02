import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { fetchDoubanDetail } from '../lib/douban';
import type { DoubanDetail } from '../lib/douban';
import { Icon } from '../icons';
import { Button, Chip, Rating } from '../ui';

export default function DoubanDetailPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const isTv = params.get('tv') === '1';
  const navigate = useNavigate();
  const [detail, setDetail] = useState<DoubanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setDetail(null);
    fetchDoubanDetail(id, isTv)
      .then((value) => {
        if (!cancelled) setDetail(value);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '豆瓣详情加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id, isTv, reloadKey]);

  const search = () => {
    if (!detail) return;
    navigate(`/search?q=${encodeURIComponent(detail.searchTitle || detail.title)}`);
  };

  const rating = Number(detail?.rating);

  return (
    <div className="douban-detail-page">
      <header className="douban-detail-top">
        <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label="返回">
          <Icon name="back" size={18} />
        </button>
        <span>豆瓣详情</span>
        <Button size="sm" variant="secondary" icon="search" onClick={search} disabled={!detail}>
          搜索片源
        </Button>
      </header>

      {loading && <div className="feed-loading"><Icon name="refresh" size={15} /> 正在加载豆瓣详情…</div>}
      {!loading && error && (
        <div className="douban-detail-error">
          <p>{error}</p>
          <div className="douban-detail-actions">
            <Button size="sm" variant="primary" onClick={() => setReloadKey((value) => value + 1)}>重试</Button>
            <Button size="sm" variant="ghost" onClick={() => navigate(-1)}>返回</Button>
          </div>
        </div>
      )}

      {!loading && detail && (
        <main className="douban-detail-body">
          <section className="douban-detail-hero">
            <div className="douban-detail-poster">
              <span>{detail.title.slice(0, 1)}</span>
              {detail.cover ? (
                <img
                  src={detail.cover}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={(event) => { event.currentTarget.style.display = 'none'; }}
                />
              ) : null}
            </div>
            <div className="douban-detail-info">
              <h1>{detail.title}</h1>
              {detail.originalTitle ? <p className="douban-detail-original">{detail.originalTitle}</p> : null}
              <div className="douban-detail-meta">
                {rating > 0 ? <Rating value={rating} /> : <span>暂无评分</span>}
                {detail.year ? <span>{detail.year}</span> : null}
                <span>{detail.isTv ? '剧集' : '电影'}</span>
                {detail.duration ? <span>{detail.duration}</span> : null}
                {detail.episodes ? <span>{detail.episodes}</span> : null}
                {detail.countries.length ? <span>{detail.countries.join(' / ')}</span> : null}
              </div>
              {detail.genres.length > 0 && (
                <div className="douban-detail-genres">
                  {detail.genres.map((genre) => <Chip key={genre}>{genre}</Chip>)}
                </div>
              )}
            </div>
          </section>

          {detail.directors.length > 0 && (
            <section className="douban-detail-credits">
              <span>导演</span>
              <p>{detail.directors.join(' / ')}</p>
            </section>
          )}
          {detail.actors.length > 0 && (
            <section className="douban-detail-credits">
              <span>主演</span>
              <p>{detail.actors.join(' / ')}</p>
            </section>
          )}
          {detail.shortComment ? <blockquote className="douban-detail-quote">{detail.shortComment}</blockquote> : null}
          {detail.intro ? (
            <section className="douban-detail-intro">
              <h2>简介</h2>
              <p>{detail.intro}</p>
            </section>
          ) : null}

          <div className="douban-detail-actions">
            <Button variant="primary" icon="search" onClick={search}>在已启用源中搜索</Button>
            <Button variant="ghost" onClick={() => navigate(-1)}>返回</Button>
          </div>
          <p className="douban-detail-note">豆瓣信息仅用于发现片名，播放地址来自已启用的采集源。</p>
        </main>
      )}
    </div>
  );
}
