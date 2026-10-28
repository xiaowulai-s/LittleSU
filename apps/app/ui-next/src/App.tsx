import { useEffect, useRef, useState } from 'react';
import { Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { AndroidShell, PreviewDock, WindowsShell } from './layout';
import { AppProvider, useApp } from './store';
import { isTauri } from './lib/env';
import { openExternal } from './lib/window';
import { Icon } from './icons';
import { DetailDrawer, DetailPage } from './detail';
import Home from './pages/Home';
import Search from './pages/Search';
import Live from './pages/Live';
import History from './pages/History';
import Favorites from './pages/Favorites';
import Settings from './pages/Settings';
import Player from './pages/Player';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/search" element={<Search />} />
      <Route path="/live" element={<Live />} />
      <Route path="/history" element={<History />} />
      <Route path="/favorites" element={<Favorites />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/title/:id" element={<DetailPage />} />
      <Route path="/player/:id" element={<Player />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}

function UpdatePrompt() {
  const { updateInfo, updateInstalling, updateProgress, installUpdate } = useApp();
  const [dismissed, setDismissed] = useState(false);
  if (!updateInfo?.hasUpdate || dismissed) return null;
  const android = /android/i.test(navigator.userAgent);
  return (
    <div className="update-prompt" role="status">
      <Icon name="sparkles" size={18} />
      <div className="update-prompt-body">
        <strong>发现新版本 v{updateInfo.latest}</strong>
        <p>
          {android
            ? '前往 Releases 下载新 APK'
            : updateInstalling
              ? `正在下载并安装 ${updateProgress ?? 0}%`
              : '可立即下载并安装，完成后自动重启'}
        </p>
        {updateInstalling && (
          <div className="progress update-progress"><span style={{ width: `${updateProgress ?? 0}%` }} /></div>
        )}
      </div>
      <div className="update-prompt-actions">
        <button
          type="button"
          className="primary"
          disabled={updateInstalling}
          onClick={() => {
            if (android) void openExternal(updateInfo.url);
            else void installUpdate();
          }}
        >
          {android ? '前往下载' : updateInstalling ? '更新中…' : '立即更新'}
        </button>
        <button type="button" onClick={() => setDismissed(true)} aria-label="稍后提醒">×</button>
      </div>
    </div>
  );
}

function AndroidBackHandler() {
  const { device, drawerId, closeDrawer } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const depth = useRef(0);

  useEffect(() => {
    if (navigationType === 'PUSH') depth.current += 1;
    else if (navigationType === 'POP') depth.current = Math.max(0, depth.current - 1);
  }, [location.key, navigationType]);

  useEffect(() => {
    if (device !== 'android' || !isTauri()) return;
    let disposed = false;
    let listener: { unregister: () => void } | undefined;
    import('@tauri-apps/api/app')
      .then(({ onBackButtonPress, exit }) => onBackButtonPress(({ canGoBack }) => {
        if (drawerId) {
          closeDrawer();
          return;
        }
        // 页面可以拦截返回（例如先退出播放页的全屏）
        const backEvent = new CustomEvent('lsu:back', { cancelable: true });
        if (!window.dispatchEvent(backEvent)) return;
        if (depth.current > 0) {
          navigate(-1);
          return;
        }
        if (canGoBack) {
          window.history.back();
          return;
        }
        void exit(0);
      }))
      .then((fn) => {
        if (disposed) fn.unregister();
        else listener = fn;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      listener?.unregister();
    };
  }, [device, drawerId, closeDrawer, navigate]);

  return null;
}

function Prototype() {
  const { device, effectiveTheme, checkUpdate, toast } = useApp();
  const location = useLocation();
  const isPlayer = location.pathname.startsWith('/player');
  const isAndroidImmersive = device === 'android'
    && (isPlayer || location.pathname.startsWith('/title'));
  const preview = !isTauri()
    && new URLSearchParams(window.location.search).get('standalone') !== '1';

  useEffect(() => {
    const scroller = document.querySelector('.page-scroll, .android-main');
    if (scroller) scroller.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [location.pathname, device]);

  useEffect(() => {
    if (preview) return;
    const timer = window.setTimeout(async () => {
      const info = await checkUpdate();
      if (info?.hasUpdate) toast(`发现新版本 v${info.latest}，可在「设置 → 关于」查看`, 'success');
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [preview, checkUpdate, toast]);

  if (!preview) {
    return (
      <div className={`prototype-root app-standalone device-${device}`} data-theme={effectiveTheme} data-device={device}>
        <AndroidBackHandler />
        {device === 'windows' ? (
          isPlayer ? <AppRoutes /> : (
            <WindowsShell overlay={<DetailDrawer />}>
              <AppRoutes />
            </WindowsShell>
          )
        ) : (
          <AndroidShell immersive={isAndroidImmersive}>
            <AppRoutes />
          </AndroidShell>
        )}
        <UpdatePrompt />
      </div>
    );
  }

  return (
    <div className="prototype-root" data-theme={effectiveTheme} data-device={device}>
      <AndroidBackHandler />
      <div className="prototype-stage">
        <div className="stage-meta">
          <span className="stage-brand">Lightframe</span>
          <span>LittleSU TV · Windows + Android 可交互原型</span>
        </div>
        <div className={`device-frame device-${device} ${isPlayer ? 'is-player' : ''}`}>
          {device === 'windows' ? (
            isPlayer ? (
              <AppRoutes />
            ) : (
              <WindowsShell overlay={<DetailDrawer />}>
                <AppRoutes />
              </WindowsShell>
            )
          ) : (
            <AndroidShell immersive={isAndroidImmersive}>
              <AppRoutes />
            </AndroidShell>
          )}
        </div>
        <PreviewDock />
        <UpdatePrompt />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Prototype />
    </AppProvider>
  );
}
