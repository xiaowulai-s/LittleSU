export type GestureKind = 'brightness' | 'volume';
export type TapSide = 'left' | 'right';

export function tapSide(clientX: number, viewportWidth: number): TapSide {
  return clientX < viewportWidth / 2 ? 'left' : 'right';
}

export function doubleTapSeekSeconds(side: TapSide): number {
  return side === 'left' ? -10 : 10;
}

export function isDoubleTap(
  last: { at: number; side: TapSide } | null,
  now: number,
  side: TapSide,
  windowMs = 320,
): boolean {
  return Boolean(last && last.side === side && now - last.at >= 0 && now - last.at <= windowMs);
}

/** 垂直滑动比例：向上为正，按视口高度归一化（最小 320px，避免小窗过于灵敏）。 */
export function gestureRatio(startY: number, currentY: number, viewportHeight: number): number {
  return (startY - currentY) / Math.max(320, viewportHeight * 0.65);
}

export function clampBrightness(value: number): number {
  return Math.min(1.6, Math.max(0.3, value));
}

export function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}
