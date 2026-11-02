import { KEYS, readJson, writeJson } from './storage';

export interface SkipMarks {
  introEnd: number;
  outroStart: number;
}

export const EMPTY_SKIP_MARKS: SkipMarks = { introEnd: 0, outroStart: 0 };

type SkipMarkMap = Record<string, SkipMarks>;

function sanitize(value: unknown): SkipMarks {
  if (!value || typeof value !== 'object') return EMPTY_SKIP_MARKS;
  const item = value as Partial<SkipMarks>;
  const introEnd = typeof item.introEnd === 'number' && Number.isFinite(item.introEnd) && item.introEnd > 0 ? item.introEnd : 0;
  const outroStart = typeof item.outroStart === 'number' && Number.isFinite(item.outroStart) && item.outroStart > 0 ? item.outroStart : 0;
  return { introEnd, outroStart };
}

export function loadSkipMarks(titleKey: string): SkipMarks {
  const all = readJson<SkipMarkMap>(KEYS.skipMarks, {});
  return sanitize(all[titleKey]);
}

export function saveSkipMarks(titleKey: string, marks: SkipMarks): void {
  const all = readJson<SkipMarkMap>(KEYS.skipMarks, {});
  all[titleKey] = sanitize(marks);
  const keys = Object.keys(all);
  if (keys.length > 100) {
    keys
      .sort((a, b) => (all[a]?.introEnd ?? 0) + (all[a]?.outroStart ?? 0) - (all[b]?.introEnd ?? 0) - (all[b]?.outroStart ?? 0))
      .slice(0, keys.length - 100)
      .forEach((key) => delete all[key]);
  }
  writeJson(KEYS.skipMarks, all);
}

export function clearSkipMarks(titleKey: string): void {
  const all = readJson<SkipMarkMap>(KEYS.skipMarks, {});
  delete all[titleKey];
  writeJson(KEYS.skipMarks, all);
}

export function shouldSkipIntro(current: number, marks: SkipMarks): boolean {
  return marks.introEnd > 1 && current > 0.5 && current < marks.introEnd - 1;
}

export function shouldSkipOutro(current: number, duration: number, marks: SkipMarks): boolean {
  return duration > 1
    && marks.outroStart > 1
    && marks.outroStart < duration - 0.5
    && current >= marks.outroStart
    && current < duration - 0.5;
}
