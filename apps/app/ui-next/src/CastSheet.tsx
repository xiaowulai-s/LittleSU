import { useEffect, useRef } from 'react';
import type { DlnaController, DlnaDevice } from './lib/dlna';
import { Icon } from './icons';
import { Button } from './ui';
import { openAndroidCastSettings } from './lib/androidNative';

interface CastSheetProps {
  open: boolean;
  url: string;
  title: string;
  controller: DlnaController;
  onClose: () => void;
  onCast?: (device: DlnaDevice) => void;
}

export default function CastSheet({ open, url, title, controller, onClose, onCast }: CastSheetProps) {
  const { devices, scanning, connecting, error, castState, chromecastAvailable, discover, cast, castChromecast, stop } = controller;
  const notifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (open) discover();
  }, [open, discover]);

  useEffect(() => {
    if (!castState) {
      notifiedRef.current = null;
      return;
    }
    if (notifiedRef.current !== castState.deviceId) {
      notifiedRef.current = castState.deviceId;
      onCast?.(devices.find((item) => item.id === castState.deviceId) ?? { id: castState.deviceId, name: castState.name });
      onClose();
    }
  }, [castState, devices, onCast, onClose]);

  if (!open) return null;

  return (
    <div className="player-sheet-layer" role="dialog" aria-modal="true">
      <button type="button" className="player-sheet-scrim" aria-label="关闭投屏" onClick={onClose} />
      <div className="player-sheet cast-sheet">
        <div className="player-sheet-head">
          <strong>投屏</strong>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={16} />
          </button>
        </div>

        {castState ? (
          <div className="cast-current">
            <div>
              <span>正在投屏到</span>
              <strong>{castState.name}</strong>
            </div>
            <Button size="sm" variant="secondary" onClick={() => { stop(); onClose(); }}>停止投屏</Button>
          </div>
        ) : null}

        {!castState && (
          <>
            {!url && <p className="cast-hint">当前没有可投屏的播放地址，请先开始播放。</p>}
            {url && scanning && <div className="feed-loading"><Icon name="refresh" size={14} /> 正在搜索同一 Wi-Fi 下的电视…</div>}
            {url && connecting && <div className="feed-loading"><Icon name="refresh" size={14} /> 正在连接电视…</div>}
            {url && !scanning && !connecting && devices.length === 0 && (
              <p className="cast-hint">{error || '未发现 DLNA 电视。请确认电视与手机在同一 Wi-Fi，或使用系统投屏。'}</p>
            )}
            {url && devices.length > 0 && (
              <div className="cast-list">
                {devices.map((device) => (
                  <button
                    type="button"
                    key={device.id}
                    className="cast-device"
                    onClick={() => cast(device, url, title)}
                    disabled={connecting}
                  >
                    <Icon name="wifi" size={17} />
                    <span>{device.name}</span>
                    <Icon name="chevronRight" size={15} />
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <div className="cast-actions">
          {url && chromecastAvailable && !castState && (
            <Button
              size="sm"
              variant="secondary"
              icon="wifi"
              onClick={() => castChromecast(url, title)}
              disabled={connecting}
            >
              Chromecast
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon="external"
            onClick={() => {
              if (!openAndroidCastSettings()) {
                controller.discover();
              }
            }}
          >
            系统投屏设置
          </Button>
          <Button size="sm" variant="ghost" icon="refresh" onClick={discover} disabled={scanning}>
            重新搜索
          </Button>
        </div>
        <p className="player-sheet-tip">
          支持 DLNA 的电视会出现在这里；Chromecast 会打开系统 Cast 设备列表。HLS 频道能否播放取决于电视/接收器解码能力。
        </p>
      </div>
    </div>
  );
}
