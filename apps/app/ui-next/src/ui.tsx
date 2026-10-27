import { useRef } from 'react';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { Icon } from './icons';
import type { IconName } from './icons';
import { useApp } from './store';
import type { SourceStatus, Title } from './data';
import { titleHueStyle } from './data';
import { cacheTitle } from './lib/titleCache';

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  icon,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
}) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${className}`} type="button" {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <button className={`icon-btn ${className}`} type="button" aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={18} />
    </button>
  );
}

export function Chip({
  active = false,
  children,
  onClick,
  tone = 'default',
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  tone?: 'default' | 'accent' | 'muted';
}) {
  return (
    <button type="button" className={`chip ${active ? 'is-active' : ''} chip-${tone}`} onClick={onClick}>
      {children}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`switch ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb" />
    </button>
  );
}

export function Rating({ value }: { value: number }) {
  return (
    <span className="rating">
      <Icon name="star" size={13} />
      {value.toFixed(1)}
    </span>
  );
}

export function SourceBadge({ name, status }: { name: string; status?: SourceStatus }) {
  return (
    <span className={`source-badge ${status ? `source-${status}` : ''}`}>
      {status && <i className={`status-dot status-${status}`} />}
      {name}
    </span>
  );
}

export function StatusDot({ status }: { status: SourceStatus }) {
  return <i className={`status-dot status-${status}`} aria-label={status} />;
}

export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actionLabel && (
        <button type="button" className="section-action" onClick={onAction}>
          {actionLabel}
          <Icon name="chevronRight" size={15} />
        </button>
      )}
    </div>
  );
}

export function ProgressBar({ value, thin = false }: { value: number; thin?: boolean }) {
  return (
    <div className={`progress ${thin ? 'progress-thin' : ''}`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Poster({
  title,
  progress,
  note,
  onOpen,
  size = 'default',
  showSource = false,
}: {
  title: Title;
  progress?: number;
  note?: string;
  onOpen?: () => void;
  size?: 'default' | 'large' | 'small';
  showSource?: boolean;
}) {
  const { openTitle, favoriteKeys, toggleFavorite, toast } = useApp();
  const key = title.key ?? title.id;
  const isFavorite = favoriteKeys.has(key);
  const open = onOpen ?? (() => { cacheTitle(title); openTitle(key); });
  return (
    <article className={`poster poster-${size}`}>
      <button
        type="button"
        className="poster-art"
        style={titleHueStyle(title.hue) as CSSProperties}
        onClick={open}
        aria-label={`打开 ${title.name}`}
      >
        <span className="poster-glow" />
        {title.poster ? (
          <img
            className="poster-img"
            src={title.poster}
            alt=""
            loading="lazy"
            onError={(event) => { event.currentTarget.style.display = 'none'; }}
          />
        ) : null}
        <span className="poster-mark">{title.name.slice(0, 1)}</span>
        <span className="poster-en">{title.en || title.name}</span>
        <span className="poster-year">{title.year}</span>
        <span className="poster-quality">{title.quality}</span>
        <span className="poster-rating"><Icon name="star" size={12} />{title.rating.toFixed(1)}</span>
        {title.badge && <span className="poster-badge">{title.badge}</span>}
        {showSource && <span className="poster-source">{title.source}</span>}
        <span className="poster-hover"><Icon name="play" size={26} /></span>
        {progress != null && (
          <span className="poster-progress-wrap"><ProgressBar value={progress} thin /></span>
        )}
      </button>
      <div className="poster-info">
        <button type="button" className="poster-title" onClick={open}>{title.name}</button>
        <div className="poster-meta">
          <span>{title.type}</span>
          <span>·</span>
          <span>{title.genres.slice(0, 2).join(' / ')}</span>
        </div>
        {note ? <div className="poster-note">{note}</div> : null}
      </div>
      <button
        type="button"
        className={`poster-fav ${isFavorite ? 'is-on' : ''}`}
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

export function Rail({
  title,
  subtitle,
  items,
  actionLabel,
  onAction,
  progressMap,
  noteMap,
}: {
  title: string;
  subtitle?: string;
  items: Title[];
  actionLabel?: string;
  onAction?: () => void;
  progressMap?: Record<string, number>;
  noteMap?: Record<string, string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => {
    ref.current?.scrollBy({ left: dir * 640, behavior: 'smooth' });
  };
  return (
    <section className="rail-section">
      <SectionHeader title={title} subtitle={subtitle} actionLabel={actionLabel} onAction={onAction} />
      <div className="rail-wrap">
        <button type="button" className="rail-arrow rail-arrow-left" onClick={() => scroll(-1)} aria-label="向左">
          <Icon name="chevronLeft" size={20} />
        </button>
        <div className="rail" ref={ref}>
          {items.map((t) => (
            <div className="rail-item" key={`${title}-${t.id}`}>
              <Poster
                title={t}
                size="small"
                progress={progressMap?.[t.id]}
                note={noteMap?.[t.id]}
              />
            </div>
          ))}
        </div>
        <button type="button" className="rail-arrow rail-arrow-right" onClick={() => scroll(1)} aria-label="向右">
          <Icon name="chevronRight" size={20} />
        </button>
      </div>
    </section>
  );
}

export function EmptyState({
  icon = 'sparkles',
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name={icon} size={26} /></span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
