import { describe, expect, it } from 'vitest';
import {
  dueEpgReminders,
  epgReminderId,
  epgReminderTime,
  isEpgReminderSet,
  pruneEpgReminders,
  toggleEpgReminder,
} from './epgReminders';
import type { EpgReminder } from './epgReminders';

const base: EpgReminder = {
  id: 'src:cctv1:2026-11-02:20:00',
  channelName: 'CCTV-1 高清',
  tvgId: 'CCTV1',
  sourceKey: 'src',
  sourceName: '源 A',
  date: '2026-11-02',
  start: '20:00',
  end: '21:00',
  title: '新闻联播',
  triggerAt: new Date('2026-11-02T20:00:00').getTime(),
};

describe('epg reminders', () => {
  it('builds stable ids from tvg-id or normalized channel name', () => {
    expect(epgReminderId({ name: 'CCTV-1 高清', tvgId: 'CCTV1' }, 'src', '2026-11-02', '20:00'))
      .toBe('src:cctv1:2026-11-02:20:00');
    expect(epgReminderId({ name: 'CCTV-1 高清' }, 'src', '2026-11-02', '20:00'))
      .toBe('src:cctv1:2026-11-02:20:00');
  });

  it('parses local reminder time and rejects invalid dates', () => {
    expect(epgReminderTime('2026-11-02', '20:00')).toBe(new Date('2026-11-02T20:00:00').getTime());
    expect(epgReminderTime('not-a-date', '20:00')).toBe(0);
  });

  it('toggles a reminder on and off', () => {
    const added = toggleEpgReminder([], base);
    expect(added).toHaveLength(1);
    expect(isEpgReminderSet(added, base.id)).toBe(true);
    const removed = toggleEpgReminder(added, base);
    expect(removed).toHaveLength(0);
  });

  it('keeps reminders sorted by trigger time', () => {
    const later = { ...base, id: 'later', triggerAt: base.triggerAt + 60_000 };
    const earlier = { ...base, id: 'earlier', triggerAt: base.triggerAt - 60_000 };
    expect(toggleEpgReminder(toggleEpgReminder([], later), earlier).map((item) => item.id))
      .toEqual(['earlier', 'later']);
  });

  it('prunes old reminders but keeps upcoming and due ones', () => {
    const now = base.triggerAt + 5 * 60 * 1000;
    const old = { ...base, id: 'old', triggerAt: now - 11 * 60 * 1000 };
    const future = { ...base, id: 'future', triggerAt: now + 60 * 60 * 1000 };
    const kept = pruneEpgReminders([base, old, future], now);
    expect(kept.map((item) => item.id)).toEqual([base.id, future.id]);
    expect(dueEpgReminders([base, old, future], now).map((item) => item.id)).toEqual([base.id]);
  });
});
