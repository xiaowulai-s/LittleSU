import { useEffect } from 'react';
import { useApp } from './store';
import { scheduleAndroidEpgReminder } from './lib/androidNative';
import {
  dueEpgReminders,
  loadEpgReminders,
  pruneEpgReminders,
  saveEpgReminders,
} from './lib/epgReminders';

const CHANGE_EVENT = 'lsu:epg-reminders-changed';

export const EPG_REMINDERS_CHANGED = CHANGE_EVENT;

export function notifyEpgRemindersChanged(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export default function EpgReminderScheduler() {
  const { toast } = useApp();

  useEffect(() => {
    let cancelled = false;

    const sync = () => {
      const list = pruneEpgReminders(loadEpgReminders());
      saveEpgReminders(list);
      const now = Date.now();
      list
        .filter((item) => item.triggerAt > now)
        .forEach((item) => {
          scheduleAndroidEpgReminder(
            item.id,
            item.triggerAt,
            item.channelName,
            `${item.title}（${item.start}）`,
          );
        });
    };

    const onChange = () => {
      if (!cancelled) sync();
    };
    sync();
    window.addEventListener(CHANGE_EVENT, onChange);

    const timer = window.setInterval(() => {
      if (cancelled) return;
      const list = loadEpgReminders();
      const due = dueEpgReminders(list);
      if (!due.length) return;
      if (document.visibilityState === 'visible') {
        due.forEach((item) => toast(`节目提醒：${item.channelName} 正在播出《${item.title}》`, 'success'));
      }
      const dueIds = new Set(due.map((item) => item.id));
      saveEpgReminders(list.filter((item) => !dueIds.has(item.id)));
      notifyEpgRemindersChanged();
    }, 15000);

    return () => {
      cancelled = true;
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.clearInterval(timer);
    };
  }, [toast]);

  return null;
}
