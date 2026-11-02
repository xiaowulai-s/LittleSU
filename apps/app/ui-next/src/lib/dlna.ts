import { useCallback, useEffect, useRef, useState } from 'react';
import {
  castChromecastDevice,
  castDlnaDevice,
  discoverDlnaDevices,
  hasChromecastSupport,
  stopChromecastDevice,
  stopDlnaDevice,
} from './androidNative';

export interface DlnaDevice {
  id: string;
  name: string;
}

export interface DlnaCastState {
  deviceId: string;
  name: string;
  kind: 'dlna' | 'chromecast';
}

interface DeviceEventDetail extends Event {
  detail?: DlnaDevice[];
}

interface CastEventDetail extends Event {
  detail?: { ok?: boolean; deviceId?: string; name?: string; message?: string };
}

export function useDlna() {
  const [devices, setDevices] = useState<DlnaDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [castState, setCastState] = useState<DlnaCastState | null>(null);
  const [chromecastAvailable] = useState(() => hasChromecastSupport());
  const castTimer = useRef<number | null>(null);

  const clearCastTimer = useCallback(() => {
    if (castTimer.current !== null) {
      window.clearTimeout(castTimer.current);
      castTimer.current = null;
    }
  }, []);

  const startCastTimer = useCallback(() => {
    clearCastTimer();
    castTimer.current = window.setTimeout(() => {
      setConnecting(false);
      setError('未选择投屏设备或连接超时');
    }, 60000);
  }, [clearCastTimer]);

  useEffect(() => {
    const onDevices = (event: Event) => {
      const detail = (event as DeviceEventDetail).detail;
      setDevices(Array.isArray(detail) ? detail.filter((item) => item && item.id && item.name) : []);
      setScanning(false);
    };
    const onCast = (event: Event) => {
      const detail = (event as CastEventDetail).detail;
      clearCastTimer();
      setConnecting(false);
      if (detail?.ok && detail.deviceId && detail.name) {
        setCastState({ deviceId: detail.deviceId, name: detail.name, kind: 'dlna' });
        setError('');
      } else {
        setError(detail?.message || '投屏失败');
      }
    };
    const onChromecast = (event: Event) => {
      const detail = (event as CastEventDetail).detail;
      clearCastTimer();
      setConnecting(false);
      if (detail?.ok && detail.deviceId && detail.name) {
        setCastState({ deviceId: detail.deviceId, name: detail.name, kind: 'chromecast' });
        setError('');
      } else {
        setError(detail?.message || 'Chromecast 投屏失败');
      }
    };
    const onStop = () => {
      clearCastTimer();
      setCastState(null);
      setConnecting(false);
    };
    window.addEventListener('lsu:dlna-devices', onDevices);
    window.addEventListener('lsu:dlna-cast', onCast);
    window.addEventListener('lsu:chromecast-cast', onChromecast);
    window.addEventListener('lsu:dlna-stop', onStop);
    window.addEventListener('lsu:chromecast-stop', onStop);
    return () => {
      clearCastTimer();
      window.removeEventListener('lsu:dlna-devices', onDevices);
      window.removeEventListener('lsu:dlna-cast', onCast);
      window.removeEventListener('lsu:chromecast-cast', onChromecast);
      window.removeEventListener('lsu:dlna-stop', onStop);
      window.removeEventListener('lsu:chromecast-stop', onStop);
    };
  }, [clearCastTimer]);

  const discover = useCallback(() => {
    setScanning(true);
    setDevices([]);
    setError('');
    if (!discoverDlnaDevices()) {
      setScanning(false);
      setError('当前环境不支持原生 DLNA 投屏');
    }
  }, []);

  const cast = useCallback((device: DlnaDevice, url: string, title: string) => {
    setConnecting(true);
    setError('');
    startCastTimer();
    if (!castDlnaDevice(device.id, url, title)) {
      clearCastTimer();
      setConnecting(false);
      setError('投屏请求发送失败');
    }
  }, [clearCastTimer, startCastTimer]);

  const castChromecast = useCallback((url: string, title: string) => {
    setConnecting(true);
    setError('');
    startCastTimer();
    if (!castChromecastDevice(url, title)) {
      clearCastTimer();
      setConnecting(false);
      setError('当前设备不支持 Chromecast');
    }
  }, [clearCastTimer, startCastTimer]);

  const stop = useCallback(() => {
    if (!castState) return;
    clearCastTimer();
    if (castState.kind === 'chromecast') stopChromecastDevice();
    else stopDlnaDevice(castState.deviceId);
    setCastState(null);
    setConnecting(false);
  }, [castState, clearCastTimer]);

  return {
    devices,
    scanning,
    connecting,
    error,
    castState,
    chromecastAvailable,
    discover,
    cast,
    castChromecast,
    stop,
  };
}

export type DlnaController = ReturnType<typeof useDlna>;
