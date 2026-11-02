import { KEYS, readJson, writeJson } from './storage';
import { normalizeChannelName } from './liveChannel';

export interface EpgReminder {
  id: string;
  channelName: string;
  tvgId?: string;
  sourceKey: string;
  sourceName: string;
  date: string;
  start: string;
  end: string;
  title: string;
  triggerAt: number;
}

export const EPG_REMINDER_LIMIT = 30;
const PAST_GRACE_MS = 10 * 60 * 1000;

export function epgReminderId(
  channel: { name: string; tvgId?: string },
  sourceKey: string,
  date: string,
  start: string,
): string {
  const key = channel.tvgId?.trim() || normalizeChannelName(channel.name);
  return `${sourceKey}:${key}:${date}:${start}`.toLowerCase();
}

export function epgReminderTime(date: string, start: string): number {
  const value = new Date(`${date}T${start}:00`).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function loadEpgReminders(): EpgReminder[] {
  const raw = readJson<unknown>(KEYS.epgReminders, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is EpgReminder => {
      if (!item || typeof item !== 'object') return false;
      const value = item as Partial<EpgReminder>;
      return typeof value.id === 'string'
        && typeof value.channelName === 'string'
        && typeof value.sourceKey === 'string'
        && typeof value.date === 'string'
        && typeof value.start === 'string'
        && typeof value.title === 'string'
        && typeof value.triggerAt === 'number'
        && Number.isFinite(value.triggerAt);
    })
    .sort((a, b) => a.triggerAt - b.triggerAt);
}

export function saveEpgReminders(list: EpgReminder[]): void {
  writeJson(KEYS.epgReminders, list.slice(0, EPG_REMINDER_LIMIT));
}

export function isEpgReminderSet(list: EpgReminder[], id: string): boolean {
  return list.some((item) => item.id === id);
}

export function toggleEpgReminder(list: EpgReminder[], reminder: EpgReminder): EpgReminder[] {
  if (isEpgReminderSet(list, reminder.id)) {
    return list.filter((item) => item.id !== reminder.id);
  }
  return [...list, reminder].sort((a, b) => a.triggerAt - b.triggerAt).slice(-EPG_REMINDER_LIMIT);
}

export function pruneEpgReminders(list: EpgReminder[], now = Date.now()): EpgReminder[] {
  return list.filter((item) => item.triggerAt > now - PAST_GRACE_MS);
}

export function dueEpgReminders(list: EpgReminder[], now = Date.now()): EpgReminder[] {
  return list.filter((item) => item.triggerAt <= now && item.triggerAt > now - PAST_GRACE_MS);
}
