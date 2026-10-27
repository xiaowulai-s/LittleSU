import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { titles as mockTitles } from './data';
import type { Title } from './data';
import {
  SOURCES,
  customDefs,
  defaultSelectedKeys,
  loadCustomApis,
  loadSelectedKeys,
  saveSelectedKeys,
} from './lib/sources';
import type { CustomApi, SourceDef } from './lib/sources';
import {
  KEYS,
  loadFavorites,
  loadHistory,
  loadSettings,
  loadTheme,
  readJson,
  saveFavorites,
  saveHistory,
  saveSettings,
  saveTheme,
  writeJson,
} from './lib/storage';
import type { FavoriteRecord, HistoryRecord, PlaybackSettings } from './lib/storage';
import { testSource } from './lib/health';
import type { SourceHealth } from './lib/health';
import { isTauri } from './lib/env';
import { openExternal } from './lib/window';
import { cacheTitle, findAnyTitle } from './lib/titleCache';
import { checkForUpdate } from './lib/update';
import type { UpdateInfo } from './lib/update';

export type Device = 'windows' | 'android';
export type ThemeMode = 'dark' | 'light' | 'system';
type ToastTone = 'default' | 'success' | 'warning';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface AppState {
  device: Device;
  setDevice: (device: Device) => void;
  theme: ThemeMode;
  effectiveTheme: 'dark' | 'light';
  setTheme: (theme: ThemeMode) => void;
  favorites: FavoriteRecord[];
  favoriteKeys: Set<string>;
  toggleFavorite: (title: Title) => void;
  history: HistoryRecord[];
  recordHistory: (record: HistoryRecord) => void;
  clearHistory: () => void;
  sourceState: Record<string, boolean>;
  toggleSource: (key: string) => void;
  setAllSources: (enabled: boolean) => void;
  setRecommendedSources: () => void;
  customApis: CustomApi[];
  activeSources: SourceDef[];
  settings: PlaybackSettings;
  updateSettings: (patch: Partial<PlaybackSettings>) => void;
  drawerId: string | null;
  openTitle: (key: string) => void;
  closeDrawer: () => void;
  getTitle: (key: string | undefined) => Title | undefined;
  updateInfo: UpdateInfo | null;
  checkUpdate: () => Promise<UpdateInfo | null>;
  updateProgress: number | null;
  updateInstalling: boolean;
  installUpdate: () => Promise<void>;
  health: Record<string, SourceHealth>;
  checkingSources: boolean;
  checkSources: () => Promise<void>;
  toast: (message: string, tone?: ToastTone) => void;
  toasts: ToastItem[];
}

const AppContext = createContext<AppState | null>(null);

function initialParams(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function initialDevice(): Device {
  const param = initialParams().get('device');
  if (param === 'android' || param === 'windows') return param;
  // Tauri Android WebView 的 UA 一定包含 Android，优先按 UA 判定，避免 WebView 宽度异常导致误判
  if (typeof navigator !== 'undefined' && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)) {
    return 'android';
  }
  return typeof window !== 'undefined' && window.innerWidth < 900 ? 'android' : 'windows';
}

function initialTheme(): ThemeMode {
  const param = initialParams().get('theme');
  if (param === 'dark' || param === 'light' || param === 'system') return param;
  return loadTheme();
}

function initialSourceState(): Record<string, boolean> {
  const selected = new Set(loadSelectedKeys());
  return Object.fromEntries(SOURCES.map((source) => [source.key, selected.has(source.key)]));
}

export function AppProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [device, setDevice] = useState<Device>(initialDevice);
  const [theme, setThemeState] = useState<ThemeMode>(initialTheme);
  const [systemLight, setSystemLight] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: light)').matches : false,
  );
  const [favorites, setFavorites] = useState<FavoriteRecord[]>(() => loadFavorites());
  const [history, setHistory] = useState<HistoryRecord[]>(() => loadHistory());
  const [sourceState, setSourceState] = useState<Record<string, boolean>>(initialSourceState);
  const [customApis] = useState<CustomApi[]>(() => loadCustomApis());
  const [settings, setSettings] = useState<PlaybackSettings>(() => loadSettings());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [health, setHealth] = useState<Record<string, SourceHealth>>(() => readJson(KEYS.health, {}));
  const [checkingSources, setCheckingSources] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (event: MediaQueryListEvent) => setSystemLight(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    saveFavorites(favorites);
  }, [favorites]);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  useEffect(() => {
    saveSelectedKeys(SOURCES.filter((source) => sourceState[source.key]).map((source) => source.key));
  }, [sourceState]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const effectiveTheme = theme === 'system' ? (systemLight ? 'light' : 'dark') : theme;

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    saveTheme(next);
  }, []);

  const favoriteKeys = useMemo(() => new Set(favorites.map((item) => item.key)), [favorites]);

  const toggleFavorite = useCallback((title: Title) => {
    const key = title.key ?? title.id;
    setFavorites((prev) => {
      if (prev.some((item) => item.key === key)) return prev.filter((item) => item.key !== key);
      const record: FavoriteRecord = {
        key,
        id: title.id,
        name: title.name,
        poster: title.poster,
        year: title.year,
        rating: title.rating,
        type: title.type,
        genres: title.genres,
        source: title.source,
        quality: title.quality,
        sourceKey: title.sourceKey,
        vodId: title.vodId,
        savedAt: Date.now(),
      };
      return [record, ...prev];
    });
  }, []);

  const recordHistory = useCallback((record: HistoryRecord) => {
    setHistory((prev) => {
      const next = prev.filter((item) => item.key !== record.key && item.name !== record.name);
      next.unshift(record);
      return next.slice(0, 60);
    });
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);

  const activeSources = useMemo<SourceDef[]>(() => {
    const builtIn = SOURCES.filter((source) => sourceState[source.key]);
    return [...builtIn, ...customDefs(customApis)];
  }, [sourceState, customApis]);

  const toggleSource = useCallback((key: string) => {
    setSourceState((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const setAllSources = useCallback((enabled: boolean) => {
    setSourceState(Object.fromEntries(SOURCES.map((source) => [source.key, enabled])));
  }, []);

  const setRecommendedSources = useCallback(() => {
    const recommended = new Set(defaultSelectedKeys());
    setSourceState(Object.fromEntries(SOURCES.map((source) => [source.key, recommended.has(source.key)])));
  }, []);

  const updateSettings = useCallback((patch: Partial<PlaybackSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const getTitle = useCallback((key: string | undefined) => findAnyTitle(key, mockTitles), []);

  const toast = useCallback((message: string, tone: ToastTone = 'default') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 2400);
  }, []);

  const checkUpdate = useCallback(async () => {
    const info = await checkForUpdate();
    setUpdateInfo(info);
    return info;
  }, []);

  const installUpdate = useCallback(async () => {
    if (!isTauri()) {
      toast('请在客户端内安装更新', 'warning');
      return;
    }
    if (/android/i.test(navigator.userAgent)) {
      await openExternal(updateInfo?.url || 'https://github.com/xiaowulai-s/LittleSU/releases/latest');
      return;
    }
    if (updateInstalling) return;
    setUpdateInstalling(true);
    setUpdateProgress(0);
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update?.available) {
        toast('已是最新版本', 'success');
        setUpdateProgress(null);
        return;
      }
      let total = 0;
      let downloaded = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await update.downloadAndInstall((event: any) => {
        if (event.event === 'Started') {
          total = event.data?.contentLength || 0;
          setUpdateProgress(0);
        } else if (event.event === 'Progress') {
          downloaded += event.data?.chunkLength || 0;
          setUpdateProgress(total ? Math.min(99, Math.round((downloaded / total) * 100)) : null);
        } else if (event.event === 'Finished') {
          setUpdateProgress(100);
        }
      });
      toast('更新安装完成，正在重启…', 'success');
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (error) {
      toast(`更新失败：${error instanceof Error ? error.message : '未知错误'}`, 'warning');
      setUpdateProgress(null);
    } finally {
      setUpdateInstalling(false);
    }
  }, [toast, updateInfo, updateInstalling]);

  const checkSources = useCallback(async () => {
    if (!isTauri()) {
      toast('源测活需要在客户端内运行', 'warning');
      return;
    }
    if (checkingSources) return;
    const targets = SOURCES.filter((source) => sourceState[source.key] || source.status === 'ok');
    if (!targets.length) {
      toast('没有可测活的源', 'warning');
      return;
    }
    setCheckingSources(true);
    const next: Record<string, SourceHealth> = { ...health };
    let index = 0;
    const worker = async () => {
      while (index < targets.length) {
        const source = targets[index++];
        const result = await testSource(source);
        next[source.key] = result;
        setHealth({ ...next });
        writeJson(KEYS.health, next);
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    setCheckingSources(false);
    const okCount = targets.filter((source) => next[source.key]?.status === 'ok').length;
    toast(`测活完成：${okCount}/${targets.length} 个源可用`, 'success');
  }, [checkingSources, health, sourceState, toast]);

  const openTitle = useCallback(
    (key: string) => {
      const title = getTitle(key);
      if (title) cacheTitle(title);
      if (device === 'windows') setDrawerId(key);
      else navigate(`/title/${encodeURIComponent(key)}`);
    },
    [device, getTitle, navigate],
  );

  const closeDrawer = useCallback(() => setDrawerId(null), []);

  const value = useMemo<AppState>(
    () => ({
      device,
      setDevice,
      theme,
      effectiveTheme,
      setTheme,
      favorites,
      favoriteKeys,
      toggleFavorite,
      history,
      recordHistory,
      clearHistory,
      sourceState,
      toggleSource,
      setAllSources,
      setRecommendedSources,
      customApis,
      activeSources,
      settings,
      updateSettings,
      drawerId,
      openTitle,
      closeDrawer,
      getTitle,
      updateInfo,
      checkUpdate,
      updateProgress,
      updateInstalling,
      installUpdate,
      health,
      checkingSources,
      checkSources,
      toast,
      toasts,
    }),
    [
      device,
      theme,
      effectiveTheme,
      setTheme,
      favorites,
      favoriteKeys,
      toggleFavorite,
      history,
      recordHistory,
      clearHistory,
      sourceState,
      toggleSource,
      setAllSources,
      setRecommendedSources,
      customApis,
      activeSources,
      settings,
      updateSettings,
      drawerId,
      openTitle,
      closeDrawer,
      getTitle,
      updateInfo,
      checkUpdate,
      updateProgress,
      updateInstalling,
      installUpdate,
      health,
      checkingSources,
      checkSources,
      toast,
      toasts,
    ],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`toast toast-${item.tone}`}>{item.message}</div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}