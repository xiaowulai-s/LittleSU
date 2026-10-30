import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { hotSearches } from '../data';
import type { Title } from '../data';
import { Icon } from '../icons';
import { useApp } from '../store';
import { useSearch } from '../lib/hooks';
import type { SearchScope } from '../lib/hooks';
import { isSourceHealthy, searchableSources } from '../lib/sources';
import { isTauri } from '../lib/env';
import { cacheTitle } from '../lib/titleCache';
import { clearSearchHistory, loadSearchHistory, mergeSearchHistory, saveSearchHistory } from '../lib/searchHistory';
import { loadSearchView, saveSearchView } from '../lib/storage';
import type { SearchView } from '../lib/storage';
import { Button, Chip, EmptyState, Poster, Rating } from '../ui';

const typeFilters = ['全部', '电影', '剧集', '纪录片', '动画'] as const;
const qualityFilters = ['全部', '4K', '1080P'] as const;
const sortFilters = ['推荐', '评分', '年份'] as const;

function ResultRow({ title }: { title: Title }) {
  const { openTitle, favoriteKeys, toggleFavorite, toast } = useApp();
  const key = title.key ?? title.id;
  const isFavorite = favoriteKeys.has(key);
  const open = () => {
    cacheTitle(title);
    openTitle(key);
  };
  return (
    <article className="result-row">
      <button type="button" className="result-row-art" onClick={open} aria-label={`打开 ${title.name}`}>
        {title.poster ? (
          <img src={title.poster} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
        ) : (
          <span>{title.name.slice(0, 1)}</span>
        )}
      </button>
      <div className="result-row-main">
        <button type="button" className="result-row-title" onClick={open}>{title.name}</button>
        <div className="result-row-meta">
          {title.rating > 0 && <Rating value={title.rating} />}
          {title.year > 0 && <span>{title.year}</span>}
          <span>{title.type}</span>
          <span>{title.quality}</span>
          <span>{title.source}</span>
        </div>
        <p className="result-row-synopsis">{title.synopsis}</p>
      </div>
      <button
        type="button"
        className={`result-row-fav ${isFavorite ? 'is-on' : ''}`}
        aria-label={isFavorite ? '取消收藏' : '收藏'}
        onClick={() => {
          toggleFavorite(title);
          toast(isFavorite ? '已取消收藏' : `已收藏《${title.name}》`, 'success');
        }}
      >
        <Icon name="heart" size={16} />
      </button>
    </article>
  );
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast, activeSources, health, customApis } = useApp();
  const urlQuery = params.get('q') ?? '';
  const [value, setValue] = useState(urlQuery);
  const [type, setType] = useState<(typeof typeFilters)[number]>('全部');
  const [quality, setQuality] = useState<(typeof qualityFilters)[number]>('全部');
  const [sort, setSort] = useState<(typeof sortFilters)[number]>('推荐');
  const [failedOpen, setFailedOpen] = useState(false);
  const [scope, setScope] = useState<SearchScope>('recommended');
  const [history, setHistory] = useState<string[]>(loadSearchHistory);
  const [view, setView] = useState<SearchView>(loadSearchView);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { loading, loadingMore, results, failures, real, total, hasMore, loadMore } = useSearch(urlQuery, scope);

  const allSources = useMemo(() => searchableSources(customApis), [customApis]);
  const okCount = useMemo(
    () => allSources.filter((source) => isSourceHealthy(source, health)).length,
    [allSources, health],
  );
  const scopeCount = scope === 'all' ? allSources.length : scope === 'ok' ? okCount : activeSources.length;

  useEffect(() => setValue(urlQuery), [urlQuery]);

  const filtered = useMemo(() => {
    let list = results.filter((title) => {
      if (type !== '全部' && title.type !== type) return false;
      if (quality !== '全部' && title.quality !== quality) return false;
      return true;
    });
    if (sort === '评分') list = [...list].sort((a, b) => b.rating - a.rating);
    if (sort === '年份') list = [...list].sort((a, b) => b.year - a.year);
    return list;
  }, [results, type, quality, sort]);

  const suggestions = useMemo(() => {
    const text = value.trim().toLowerCase();
    if (!focused || !text) return [];
    const seen = new Set<string>();
    const list: string[] = [];
    for (const item of [...history, ...hotSearches]) {
      if (!item.toLowerCase().includes(text) || item.toLowerCase() === text || seen.has(item)) continue;
      seen.add(item);
      list.push(item);
      if (list.length >= 6) break;
    }
    return list;
  }, [focused, value, history]);

  const remember = (query: string) => {
    const next = mergeSearchHistory(history, query);
    setHistory(next);
    saveSearchHistory(next);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const query = value.trim();
    setParams(query ? { q: query } : {});
    if (query) {
      remember(query);
      setFocused(false);
      toast(real ? `正在 ${scopeCount} 个源中搜索「${query}」` : `正在示例数据中搜索「${query}」`, 'success');
    }
  };

  const runSearch = (query: string) => {
    const text = query.trim();
    if (!text) return;
    remember(text);
    setValue(text);
    setParams({ q: text });
    setFocused(false);
    inputRef.current?.blur();
  };

  const changeView = (next: SearchView) => {
    setView(next);
    saveSearchView(next);
  };

  const showSkeleton = loading && !filtered.length;

  return (
    <div className="search-page">
      <form className="search-hero" onSubmit={submit}>
        <div className="search-hero-field">
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="搜索片名、演员、类型或年份"
            aria-label="搜索"
          />
          {value && (
            <button type="button" className="search-clear" onClick={() => { setValue(''); setParams({}); }} aria-label="清空">
              <Icon name="close" size={16} />
            </button>
          )}
          {focused && value.trim() && (
            <div className="search-suggest" onMouseDown={(event) => event.preventDefault()}>
              <button type="button" className="search-suggest-item is-primary" onClick={() => runSearch(value)}>
                <Icon name="search" size={15} />
                搜索「{value.trim()}」
              </button>
              {suggestions.map((item) => (
                <button type="button" key={item} className="search-suggest-item" onClick={() => runSearch(item)}>
                  <Icon name="history" size={14} />
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button variant="primary" size="md" type="submit">搜索</Button>
      </form>

      <div className="search-filter-bar">
        <div className="filter-group">
          <span className="filter-label">来源</span>
          <Chip active={scope === 'recommended'} onClick={() => setScope('recommended')}>推荐源 {activeSources.length}</Chip>
          <Chip active={scope === 'all'} onClick={() => setScope('all')}>全部 {allSources.length}</Chip>
          <Chip active={scope === 'ok'} onClick={() => setScope('ok')}>可用 {okCount}</Chip>
        </div>
        <div className="filter-group">
          <span className="filter-label">类型</span>
          {typeFilters.map((item) => <Chip key={item} active={type === item} onClick={() => setType(item)}>{item}</Chip>)}
        </div>
        <div className="filter-group">
          <span className="filter-label">清晰度</span>
          {qualityFilters.map((item) => <Chip key={item} active={quality === item} onClick={() => setQuality(item)}>{item}</Chip>)}
        </div>
        <div className="filter-group filter-group-end">
          <span className="filter-label">排序</span>
          {sortFilters.map((item) => <Chip key={item} active={sort === item} onClick={() => setSort(item)}>{item}</Chip>)}
        </div>
      </div>

      {failures.length > 0 && (
        <div className="failed-sources">
          <button type="button" className="failed-summary" onClick={() => setFailedOpen((prev) => !prev)}>
            <span className="failed-dot" />
            {failures.length} 个源未响应，已自动跳过
            <Icon name={failedOpen ? 'chevronDown' : 'chevronRight'} size={15} />
          </button>
          {failedOpen && (
            <div className="failed-list">
              {failures.map((item) => <span key={item.name}>{item.name} · {item.reason}</span>)}
            </div>
          )}
        </div>
      )}

      {!urlQuery && history.length > 0 && (
        <section className="hot-search-section search-history-section">
          <div className="section-header">
            <div><h2>搜索历史</h2><p>最近 {history.length} 条，保存在本机</p></div>
            <button
              type="button"
              className="section-action"
              onClick={() => {
                clearSearchHistory();
                setHistory([]);
                toast('已清空搜索历史', 'success');
              }}
            >
              清空
              <Icon name="trash" size={14} />
            </button>
          </div>
          <div className="search-history-chips">
            {history.map((query) => (
              <Chip key={query} onClick={() => runSearch(query)}>{query}</Chip>
            ))}
          </div>
        </section>
      )}

      {!urlQuery && (
        <section className="hot-search-section">
          <div className="section-header">
            <div><h2>热门搜索</h2><p>大家都在找</p></div>
          </div>
          <div className="hot-search-list">
            {hotSearches.map((query, index) => (
              <button type="button" key={query} className="hot-search-item" onClick={() => runSearch(query)}>
                <span className={`hot-rank ${index < 3 ? 'is-top' : ''}`}>{String(index + 1).padStart(2, '0')}</span>
                <span>{query}</span>
                <Icon name="chevronRight" size={15} />
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="results-section">
        <div className="results-head">
          <div>
            <h2>{urlQuery ? `「${urlQuery}」的搜索结果` : '为你推荐'}</h2>
            <p>
              {showSkeleton
                ? `正在从 ${total || scopeCount} 个源流式搜索…`
                : `${filtered.length} 个结果 · ${real ? '已跨源去重' : '示例数据'}${loading ? ' · 仍在搜索…' : ''}`}
            </p>
          </div>
          <div className="results-view-toggle">
            <button type="button" className={view === 'grid' ? 'is-active' : ''} aria-label="网格" onClick={() => changeView('grid')}>
              <Icon name="grid" size={17} />
            </button>
            <button type="button" className={view === 'list' ? 'is-active' : ''} aria-label="列表" onClick={() => changeView('list')}>
              <Icon name="list" size={17} />
            </button>
          </div>
        </div>

        {showSkeleton ? (
          <div className="result-grid">
            {Array.from({ length: 10 }, (_, index) => (
              <div className="skeleton-card" key={index}><span /><i /><i /></div>
            ))}
          </div>
        ) : filtered.length ? (
          view === 'grid' ? (
            <div className="result-grid">
              {filtered.map((title) => <Poster key={title.key ?? title.id} title={title} showSource />)}
            </div>
          ) : (
            <div className="result-list">
              {filtered.map((title) => <ResultRow key={title.key ?? title.id} title={title} />)}
            </div>
          )
        ) : total === 0 && isTauri() ? (
          <EmptyState
            icon="wifi"
            title="没有可用的数据源"
            description="请先在设置中启用数据源，再搜索片名。"
            action={<Button variant="primary" onClick={() => navigate('/settings?section=sources')}>去设置</Button>}
          />
        ) : urlQuery ? (
          <EmptyState
            icon="search"
            title="没有找到匹配内容"
            description={real ? '试试更短的片名，或在设置中启用更多源。' : `试试更短的片名，或切换到全部 ${allSources.length} 个源。`}
            action={<Button variant="primary" onClick={() => { setType('全部'); setQuality('全部'); setSort('推荐'); }}>清除筛选</Button>}
          />
        ) : null}

        {real && (hasMore || loadingMore) && (
          <div className="search-more">
            <Button variant="secondary" size="md" icon="refresh" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? '正在加载更多…' : '加载更多'}
            </Button>
          </div>
        )}
      </section>

      <div className="search-footnote">
        <Icon name="wifi" size={14} />
        {real ? '搜索请求直接发往第三方采集源，不经本项目服务器。' : '当前为示例数据；在 Tauri 客户端内会自动切换为真实源搜索。'}
        <button type="button" onClick={() => navigate('/settings?section=sources')}>管理数据源</button>
      </div>
    </div>
  );
}
