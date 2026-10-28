export type GestureKind = 'brightness' | 'volume';

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
