import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './icons';
import type { IconName } from './icons';
import { useApp } from './store';
import { Button, IconButton } from './ui';
import { SOURCES } from './lib/sources';

const navItems: { path: string; label: string; icon: IconName }[] = [
  { path: '/', label: '首页', icon: 'home' },
  { path: '/search', label: '搜索', icon: 'search' },
  { path: '/live', label: '直播', icon: 'live' },
  { path: '/history', label: '历史', icon: 'history' },
  { path: '/favorites', label: '收藏', icon: 'heart' },
  { path: '/settings', label: '设置', icon: 'settings' },
];

const mobileNav = navItems.filter((item) => item.path !== '/favorites');

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      <span className="brand-mark">
        <svg viewBox="0 0 24 24" width={compact ? 22 : 26} height={compact ? 22 : 26} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="6" width="18" height="13" rx="3" />
          <path d="m8 3 4 3 4-3" />
          <path d="M10 11v4.5l4-2.25z" fill="currentColor" stroke="none" />
        </svg>
      </span>
      <span className="brand-name">Little<span>SU</span> TV</span>
    </div>
  );
}

function isActive(pathname: string, path: string) {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

function GlobalSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const query = new URLSearchParams(location.search).get('q') ?? '';
  const [value, setValue] = useState(query);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  };

  return (
    <form className="global-search" onSubmit={submit} role="search">
      <Icon name="search" size={17} />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="搜索片名、演员或类型"
        aria-label="搜索"
      />
      <kbd>Enter</kbd>
    </form>
  );
}

function ThemeButton() {
  const { effectiveTheme, setTheme } = useApp();
  const next = effectiveTheme === 'dark' ? 'light' : 'dark';
  return (
    <IconButton
      icon={effectiveTheme === 'dark' ? 'sun' : 'moon'}
      label={effectiveTheme === 'dark' ? '切换浅色' : '切换深色'}
      onClick={() => setTheme(next)}
    />
  );
}

function WindowControls() {
  const { toast } = useApp();
  const notAvailable = () => toast('原型模式：窗口控制将在 Tauri 中生效');
  return (
    <div className="window-controls" aria-label="窗口控制">
      <button type="button" aria-label="最小化" onClick={notAvailable}>—</button>
      <button type="button" aria-label="最大化" onClick={notAvailable}>□</button>
      <button type="button" className="win-close" aria-label="关闭" onClick={notAvailable}>×</button>
    </div>
  );
}

function TitleBar() {
  return (
    <header className="title-bar" data-tauri-drag-region>
      <Brand compact />
      <div className="title-search"><GlobalSearch /></div>
      <div className="title-actions">
        <ThemeButton />
        <WindowControls />
      </div>
    </header>
  );
}

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sourceState, customApis } = useApp();
  const total = SOURCES.length + customApis.length;
  const enabled = SOURCES.filter((s) => sourceState[s.key]).length + customApis.length;
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <Brand />
        <p className="sidebar-tagline">聚合搜索 · 直连播放 · 多端同步</p>
      </div>
      <nav className="side-nav" aria-label="主导航">
        {navItems.map((item) => (
          <button
            key={item.path}
            type="button"
            className={`side-nav-item ${isActive(location.pathname, item.path) ? 'is-active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
            {item.path === '/live' && <i className="nav-dot" />}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="source-pulse">
          <div className="source-pulse-head">
            <span className="source-pulse-title">数据源</span>
            <span className="source-pulse-count">{enabled} / {total}</span>
          </div>
          <div className="source-pulse-bar">
            <span style={{ width: `${(enabled / total) * 100}%` }} />
          </div>
          <p>{enabled} 个已启用源 · 原生取流</p>
          <Button size="sm" variant="ghost" icon="settings" onClick={() => navigate('/settings')}>管理数据源</Button>
        </div>
        <div className="sidebar-version">v1.2.7 · Lightframe 原型</div>
      </div>
    </aside>
  );
}

export function WindowsShell({ children, overlay }: { children: ReactNode; overlay?: ReactNode }) {
  return (
    <div className="shell windows-shell">
      <TitleBar />
      <div className="windows-body">
        <Sidebar />
        <main className="windows-main">
          <div className="page-scroll">{children}</div>
        </main>
      </div>
      {overlay}
    </div>
  );
}

function AndroidTopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const isSearch = location.pathname === '/search';
  return (
    <header className="android-topbar">
      <button type="button" className="android-brand" onClick={() => navigate('/')} aria-label="首页">
        <Brand compact />
      </button>
      <div className="android-top-actions">
        {!isSearch && <IconButton icon="search" label="搜索" onClick={() => navigate('/search')} />}
        <IconButton icon="heart" label="收藏" onClick={() => navigate('/favorites')} />
        <ThemeButton />
      </div>
    </header>
  );
}

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <nav className="bottom-nav" aria-label="底部导航">
      {mobileNav.map((item) => (
        <button
          key={item.path}
          type="button"
          className={`bottom-nav-item ${isActive(location.pathname, item.path) ? 'is-active' : ''}`}
          onClick={() => navigate(item.path)}
        >
          <span className="bottom-nav-icon"><Icon name={item.icon} size={21} /></span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function AndroidShell({ children, immersive = false }: { children: ReactNode; immersive?: boolean }) {
  return (
    <div className={`shell android-shell ${immersive ? 'is-immersive' : ''}`}>
      {!immersive && <AndroidTopBar />}
      <main className="android-main">{children}</main>
      {!immersive && <BottomNav />}
    </div>
  );
}

export function PreviewDock() {
  const { device, setDevice, effectiveTheme, setTheme } = useApp();
  const navigate = useNavigate();
  return (
    <div className="preview-dock" role="toolbar" aria-label="原型预览设置">
      <span className="preview-badge">PROTOTYPE</span>
      <div className="segmented" aria-label="设备">
        <button type="button" className={device === 'windows' ? 'is-active' : ''} onClick={() => setDevice('windows')}>
          <Icon name="monitor" size={15} /> Windows
        </button>
        <button type="button" className={device === 'android' ? 'is-active' : ''} onClick={() => setDevice('android')}>
          <Icon name="live" size={15} /> Android
        </button>
      </div>
      <div className="segmented" aria-label="主题">
        <button type="button" className={effectiveTheme === 'dark' ? 'is-active' : ''} onClick={() => setTheme('dark')}>
          <Icon name="moon" size={15} /> 深色
        </button>
        <button type="button" className={effectiveTheme === 'light' ? 'is-active' : ''} onClick={() => setTheme('light')}>
          <Icon name="sun" size={15} /> 浅色
        </button>
      </div>
      <button type="button" className="preview-reset" onClick={() => navigate('/')}>回到首页</button>
    </div>
  );
}
