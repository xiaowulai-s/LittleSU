import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { historyItems, titles as mockTitles } from '../data';
import type { Title } from '../data';
import { Icon } from '../icons';
import { useApp } from '../store';
import { historyToTitle } from '../lib/adapters';
import { cacheTitle } from '../lib/titleCache';
import { Button, Chip, EmptyState, Poster, ProgressBar } from '../ui';

interface HistoryRow {
  key: string;
  title: Title;
  progress: number;
  note: string;
}

export default function History() {
  const navigate = useNavigate();
  const { history, clearHistory, toast } = useApp();
  const [filter, setFilter] = useState<'全部' | '剧集' | '电影'>('全部');

  const rows = useMemo<HistoryRow[]>(() => {
    if (history.length) {
      return history.map((record) => ({
        key: record.key,
        title: historyToTitle(record),
        progress: record.progress,
        note: `${record.episodeName || `第 ${(record.episodeIndex ?? 0) + 1} 集`} · ${new Date(record.timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      }));
    }
    return historyItems
      .map((item) => {
        const title = mockTitles.find((mock) => mock.id === item.titleId);
        return title
          ? { key: title.id, title, progress: item.progress, note: `${item.episode} · ${item.watchedAt}` }
          : null;
      })
      .filter((row): row is HistoryRow => Boolean(row));
  }, [history]);

  const list = rows.filter((row) => filter === '全部' || row.title.type === filter);
  const usingMock = !history.length;

  return (
    <div className="history-page">
      <div className="page-heading">
        <div>
          <div className="page-kicker">观看记录</div>
          <h1>历史</h1>
          <p>{history.length ? `${history.length} 条记录 · 仅保存在本机` : '暂无真实记录，展示示例内容'}</p>
        </div>
        <div className="page-heading-actions">
          <Button
            size="sm"
            variant="ghost"
            icon="trash"
            disabled={!history.length}
            onClick={() => { clearHistory(); toast('已清空观看历史', 'success'); }}
          >
            清空
          </Button>
        </div>
      </div>

      <div className="filter-row">
        {(['全部', '剧集', '电影'] as const).map((item) => (
          <Chip key={item} active={filter === item} onClick={() => setFilter(item)}>{item}</Chip>
        ))}
        <span className="filter-spacer" />
        <span className="muted-text">
          <Icon name="clock" size={14} />
          {usingMock ? '示例数据' : '最近观看优先'}
        </span>
      </div>

      {list.length ? (
        <div className="history-grid">
          {list.map((row) => (
            <div className="history-card" key={row.key}>
              <Poster title={row.title} progress={row.progress} note={row.note} />
              <button type="button" className="history-continue" onClick={() => { cacheTitle(row.title); navigate(`/player/${encodeURIComponent(row.key)}`); }}>
                <Icon name="play" size={15} />
                继续播放
              </button>
              <div className="history-progress-line">
                <ProgressBar value={row.progress} thin />
                <span>{row.progress}%</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="history"
          title="还没有观看记录"
          description="播放过的内容会自动出现在这里。"
          action={<Button variant="primary" onClick={() => navigate('/')}>去首页看看</Button>}
        />
      )}
    </div>
  );
}