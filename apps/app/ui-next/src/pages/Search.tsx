import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { hotSearches, titles as mockTitles } from '../data';
import { Icon } from '../icons';
import { useApp } from '../store';
import { useSearch } from '../lib/hooks';
import { Button, Chip, EmptyState, Poster, SectionHeader } from '../ui';

const typeFilters = ['全部', '电影', '剧集', '纪录片', '动画'] as const;
const qualityFilters = ['全部', '4K', '1080P'] as const;
const sortFilters = ['推荐', '评分', '年份'] as const;

export default function Search() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast, activeSources } = useApp();
  const urlQuery = params.get('q') ?? '';
  const [value, setValue] = useState(urlQuery);
  const [type, setType] = useState<(typeof typeFilters)[number]>('全部');
  const [quality, setQuality] = useState<(typeof qualityFilters)[number]>('全部');
  const [sort, setSort] = useState<(typeof sortFilters)[number]>('推荐');
  const [failedOpen, setFailedOpen] = useState(false);
  const [scope, setScope] = useState<'recommended' | 'all' | 'ok'>('recommended');
  const { loading, results, failures, real } = useSearch(urlQuery);

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

  const related = useMemo(
    () => mockTitles.filter((title) => !filtered.some((item) => (item.key ?? item.id) === title.id)).slice(0, 6),
    [filtered],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const query = value.trim();
    setParams(query ? { q: query } : {});
    if (query) {
      toast(real ? `正在 ${activeSources.length} 个源中搜索「${query}」` : `正在示例数据中搜索「${query}」`, 'success');
    }
  };

  const runSearch = (query: string) => {
    setValue(query);
    setParams({ q: query });
  };

  const showSkeleton = loading && !filtered.length;

  return (
    <div className="search-page">
      <form className="search-hero" onSubmit={submit}>
        <div className="search-hero-field">
          <Icon name="search" size={20} />
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="搜索片名、演员、类型或年份"
            aria-label="搜索"
          />
          {value && (
            <button type="button" className="search-clear" onClick={() => { setValue(''); setParams({}); }} aria-label="清空">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        <Button variant="primary" size="md" type="submit">搜索</Button>
      </form>

      <div className="search-filter-bar">
        <div className="filter-group">
          <span className="filter-label">来源</span>
          <Chip active={scope === 'recommended'} onClick={() => setScope('recommended')}>推荐源 {activeSources.length}</Chip>
          <Chip active={scope === 'all'} onClick={() => setScope('all')}>全部 25</Chip>
          <Chip active={scope === 'ok'} onClick={() => setScope('ok')}>可用 10</Chip>
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
                ? `正在从 ${real ? activeSources.length : 0} 个源流式搜索…`
                : `${filtered.length} 个结果 · ${real ? '已跨源去重' : '示例数据'}${loading ? ' · 仍在搜索…' : ''}`}
            </p>
          </div>
          <div className="results-view-toggle">
            <button type="button" className="is-active" aria-label="网格"><Icon name="grid" size={17} /></button>
            <button type="button" aria-label="列表" onClick={() => toast('列表视图将在下一版提供')}><Icon name="list" size={17} /></button>
          </div>
        </div>

        {showSkeleton ? (
          <div className="result-grid">
            {Array.from({ length: 10 }, (_, index) => (
              <div className="skeleton-card" key={index}><span /><i /><i /></div>
            ))}
          </div>
        ) : filtered.length ? (
          <div className="result-grid">
            {filtered.map((title) => <Poster key={title.key ?? title.id} title={title} showSource />)}
          </div>
        ) : urlQuery ? (
          <EmptyState
            icon="search"
            title="没有找到匹配内容"
            description={real ? '试试更短的片名，或在设置中启用更多源。' : '试试更短的片名，或切换到全部 25 个源。'}
            action={<Button variant="primary" onClick={() => { setType('全部'); setQuality('全部'); setSort('推荐'); }}>清除筛选</Button>}
          />
        ) : null}
      </section>

      {related.length > 0 && (
        <section className="results-section related-results">
          <SectionHeader title="相关推荐" subtitle="基于当前搜索继续发现" />
          <div className="result-grid">
            {related.map((title) => <Poster key={title.id} title={title} showSource />)}
          </div>
        </section>
      )}

      <div className="search-footnote">
        <Icon name="wifi" size={14} />
        {real ? '搜索请求直接发往第三方采集源，不经本项目服务器。' : '当前为示例数据；在 Tauri 客户端内会自动切换为真实源搜索。'}
        <button type="button" onClick={() => navigate('/settings?section=sources')}>管理数据源</button>
      </div>
    </div>
  );
}