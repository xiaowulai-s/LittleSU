import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AndroidShell, PreviewDock, WindowsShell } from './layout';
import { AppProvider, useApp } from './store';
import { isTauri } from './lib/env';
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
      <div className="prototype-root app-standalone" data-theme={effectiveTheme} data-device={device}>
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
      </div>
    );
  }

  return (
    <div className="prototype-root" data-theme={effectiveTheme} data-device={device}>
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
