import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../icons';
import { useApp } from '../store';
import { favoriteToTitle } from '../lib/adapters';
import { Button, Chip, EmptyState, Poster } from '../ui';

const filters = ['全部', '电影', '剧集', '纪录片', '动画'] as const;

export default function Favorites() {
  const navigate = useNavigate();
  const { favorites, toggleFavorite, toast } = useApp();
  const [filter, setFilter] = useState<(typeof filters)[number]>('全部');
  const [manage, setManage] = useState(false);

  const list = useMemo(
    () => favorites
      .map((record) => favoriteToTitle(record))
      .filter((title) => filter === '全部' || title.type === filter),
    [favorites, filter],
  );

  return (
    <div className="favorites-page">
      <div className="page-heading">
        <div>
          <div className="page-kicker">我的片单</div>
          <h1>收藏</h1>
          <p>{favorites.length} 部内容 · 本机保存</p>
        </div>
        <div className="page-heading-actions">
          <Button size="sm" variant={manage ? 'primary' : 'ghost'} icon="check" onClick={() => setManage((value) => !value)}>
            {manage ? '完成' : '管理'}
          </Button>
        </div>
      </div>

      <div className="filter-row">
        {filters.map((item) => <Chip key={item} active={filter === item} onClick={() => setFilter(item)}>{item}</Chip>)}
        <span className="filter-spacer" />
        <span className="muted-text"><Icon name="heart" size={14} /> 按收藏时间排序</span>
      </div>

      {list.length ? (
        <div className="favorites-grid">
          {list.map((title) => (
            <div className="favorite-card" key={title.key ?? title.id}>
              <Poster title={title} />
              {manage && (
                <button
                  type="button"
                  className="favorite-remove"
                  onClick={() => {
                    toggleFavorite(title);
                    toast(`已移出收藏《${title.name}》`, 'success');
                  }}
                >
                  <Icon name="close" size={14} /> 移除
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="heart"
          title="收藏夹是空的"
          description="在任意影片卡片上点击心形，就会收藏到这里。"
          action={<Button variant="primary" onClick={() => navigate('/search')}>去发现内容</Button>}
        />
      )}

      {manage && list.length > 0 && (
        <div className="manage-bar">
          <span>共 {list.length} 项</span>
          <Button
            size="sm"
            variant="danger"
            icon="trash"
            onClick={() => {
              list.forEach((title) => toggleFavorite(title));
              toast('已清空当前收藏', 'success');
            }}
          >
            全部移除
          </Button>
        </div>
      )}
    </div>
  );
}