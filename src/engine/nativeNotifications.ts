/**
 * True Native Android OS Local Notifications via @capacitor/local-notifications.
 * Safely no-ops on web browsers while scheduling real OS-level notifications
 * inside the installed LunaCycle Android APK so reminders fire even when closed.
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type {
  ActiveHygieneTimer,
  LunaData,
  PartnerSnapshot,
  PartnerWatchConfig,
  TodaySummary,
} from '../types';
import { computePillPackStatus, getPillReminderTimes } from './hygieneTimer';
import { buildScheduledPartnerCareAlerts } from './partnerNotifications';
import { addDays } from './temporal';

const ID_PERIOD = 1001;
const ID_DAILY_LOG = 1002;
const ID_PILL = 1003;
const ID_HYGIENE = 1004;
const ID_PILL_REFILL = 1005;
const ID_PILL_TEST = 1006;
const ID_PILL_SNOOZE = 1007;
const ID_PILL_SLOT_BASE = 3000; // 3000..3099 reserved for 7-day exact multi-reminder pill alarms
const ID_PARTNER_PMS = 2001;
const ID_PARTNER_TOMORROW = 2002;
const ID_PARTNER_FERTILE = 2003;
const ID_PARTNER_DAILY = 2004;
const ID_PARTNER_TEST = 2005;

const PILL_ALARM_CHANNEL_ID = 'lunacycle_pill_alarm';

async function ensurePillAlarmChannel(): Promise<void> {
  if (!isNativeNotificationRuntime()) return;
  try {
    await LocalNotifications.createChannel({
      id: PILL_ALARM_CHANNEL_ID,
      name: 'Daily Pill Alarm',
      description: 'High-priority daily pill time and refill reminders',
      importance: 5,
      visibility: 1,
      vibration: true,
    });
  } catch {
    // Ignore on platforms where channels are unsupported
  }
}

export function isNativeNotificationRuntime(): boolean {
  return Capacitor.isNativePlatform();
}

export async function requestNativeNotificationPermission(): Promise<boolean> {
  if (!isNativeNotificationRuntime()) return false;
  try {
    const perm = await LocalNotifications.requestPermissions();
    return perm.display === 'granted';
  } catch {
    return false;
  }
}

function getSafeText(
  disguiseMode: boolean,
  customText: string,
  defaultTitle: string,
  defaultBody: string,
): { title: string; body: string } {
  const custom = customText.trim();
  if (custom) {
    return { title: disguiseMode ? 'Daily Notes' : 'LunaCycle', body: custom };
  }
  if (disguiseMode) {
    return { title: 'Daily Notes', body: 'You have a scheduled note check-in.' };
  }
  return { title: defaultTitle, body: defaultBody };
}

export async function syncNativeScheduledNotifications(
  data: LunaData,
  summary: TodaySummary,
  latestPeriodStartDate?: string | null,
): Promise<void> {
  if (!isNativeNotificationRuntime()) return;
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display !== 'granted') return;

    const pillSlotCancels = Array.from({ length: 32 }, (_, i) => ({ id: ID_PILL_SLOT_BASE + i }));
    await LocalNotifications.cancel({
      notifications: [
        { id: ID_PERIOD },
        { id: ID_DAILY_LOG },
        { id: ID_PILL },
        { id: ID_PILL_REFILL },
        ...pillSlotCancels,
      ],
    });

    const toSchedule: Array<{
      id: number;
      title: string;
      body: string;
      channelId?: string;
      extra?: Record<string, string>;
      schedule: {
        at?: Date;
        on?: { hour: number; minute: number };
        repeats?: boolean;
        allowWhileIdle?: boolean;
      };
    }> = [];

    const { reminders, disguiseMode, pillPack } = data.settings;

    // 1. Period Approaching (9:00 AM local time N days before predicted period)
    if (reminders.periodEnabled && summary.mode !== 'pregnancy' && summary.nextPeriodDate) {
      const targetIso = addDays(summary.nextPeriodDate, -reminders.periodBeforeDays);
      const [y, m, d] = targetIso.split('-').map(Number);
      const atDate = new Date(y, m - 1, d, 9, 0, 0);
      if (atDate.getTime() > Date.now() + 60_000) {
        const msg = getSafeText(
          disguiseMode,
          reminders.customNotificationText,
          'LunaCycle Reminder',
          `Period expected in ${reminders.periodBeforeDays} days.`,
        );
        toSchedule.push({ id: ID_PERIOD, ...msg, schedule: { at: atDate } });
      }
    }

    // 2. Daily Symptom Check-In
    if (reminders.dailyLogEnabled) {
      const [hour, minute] = reminders.dailyLogTime.split(':').map(Number);
      if (Number.isFinite(hour) && Number.isFinite(minute)) {
        const msg = getSafeText(
          disguiseMode,
          reminders.customNotificationText,
          'Daily Check-In',
          'Take 10 seconds to log how you feel today.',
        );
        toSchedule.push({
          id: ID_DAILY_LOG,
          ...msg,
          schedule: { on: { hour, minute }, repeats: true },
        });
      }
    }

    // 3. Daily Pill Alarms (MedClock-style 7-day exact AlarmManager slots for 1..4 daily times) & Refill Reminder
    if (pillPack.enabled && !data.settings.simpleMode) {
      await ensurePillAlarmChannel();
      const pillStatus = computePillPackStatus(pillPack, summary.today, latestPeriodStartDate);
      const reminderTimes = getPillReminderTimes(pillPack);

      if (pillPack.alarmEnabled ?? true) {
        const doseLabel =
          pillStatus.pillsPerDay === 1 ? '1 pill' : `${pillStatus.pillsPerDay} pills`;
        const now = new Date();
        let slotIdx = 0;

        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
          const targetIso = addDays(summary.today, dayOffset);
          if (targetIso < pillStatus.effectiveStartDate) continue;
          const [ty, tm, td] = targetIso.split('-').map(Number);

          for (const timeStr of reminderTimes) {
            if (slotIdx >= 32) break;
            const [hour, minute] = timeStr.split(':').map(Number);
            if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue;
            const fireAt = new Date(ty, tm - 1, td, hour, minute, 0, 0);
            if (fireAt.getTime() <= now.getTime() + 2000) continue;

            const msg = getSafeText(
              disguiseMode,
              reminders.customNotificationText,
              'Daily Pill Alarm',
              `Time to take your daily dose (${doseLabel}) — ${timeStr}.`,
            );
            toSchedule.push({
              id: ID_PILL_SLOT_BASE + slotIdx,
              ...msg,
              channelId: PILL_ALARM_CHANNEL_ID,
              extra: { type: 'pill_alarm', scheduledTime: timeStr },
              schedule: { at: fireAt, allowWhileIdle: true },
            });
            slotIdx += 1;
          }
        }
      }

      if ((pillPack.refillReminderEnabled ?? true) && pillStatus.refillAlertDate) {
        const [ry, rm, rd] = pillStatus.refillAlertDate.split('-').map(Number);
        const [rh, rmin] = (reminderTimes[0] ?? '09:00').split(':').map(Number);
        const refillAt = new Date(
          ry,
          rm - 1,
          rd,
          Number.isFinite(rh) ? rh : 9,
          Number.isFinite(rmin) ? rmin : 0,
          0,
        );
        if (refillAt.getTime() > Date.now() + 60_000) {
          const threshold = pillPack.refillThresholdDays ?? 5;
          const msg = getSafeText(
            disguiseMode,
            reminders.customNotificationText,
            'Pill Pack Refill Reminder',
            `Only ${threshold} ${threshold === 1 ? 'day' : 'days'} left in your pack — remember to refill soon.`,
          );
          toSchedule.push({
            id: ID_PILL_REFILL,
            ...msg,
            channelId: PILL_ALARM_CHANNEL_ID,
            schedule: { at: refillAt, allowWhileIdle: true },
          });
        }
      }
    }

    if (toSchedule.length > 0) {
      await LocalNotifications.schedule({ notifications: toSchedule });
    }
  } catch {
    // Ignore native scheduling errors gracefully
  }
}

export async function scheduleNativeHygieneNotification(
  timer: ActiveHygieneTimer | null,
  disguiseMode: boolean,
  customText: string,
): Promise<void> {
  if (!isNativeNotificationRuntime()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: ID_HYGIENE }] });
    if (!timer) return;

    const status = await LocalNotifications.checkPermissions();
    if (status.display !== 'granted') return;

    const atDate = new Date(timer.endsAt);
    if (atDate.getTime() <= Date.now() + 5_000) return;

    const msg = getSafeText(
      disguiseMode,
      customText,
      'Hygiene Change Reminder',
      `Your ${timer.durationHours}h ${timer.product} timer is up.`,
    );
    await LocalNotifications.schedule({
      notifications: [{ id: ID_HYGIENE, ...msg, schedule: { at: atDate } }],
    });
  } catch {
    // Ignore
  }
}

export async function syncNativePartnerNotifications(
  snapshot: PartnerSnapshot | null,
  watchConfig: PartnerWatchConfig | null,
  disguiseMode: boolean,
  customText: string,
): Promise<void> {
  if (!isNativeNotificationRuntime()) return;
  try {
    await LocalNotifications.cancel({
      notifications: [
        { id: ID_PARTNER_PMS },
        { id: ID_PARTNER_TOMORROW },
        { id: ID_PARTNER_FERTILE },
        { id: ID_PARTNER_DAILY },
      ],
    });

    if (!snapshot || !watchConfig?.alertsOnThisPhone) return;
    const status = await LocalNotifications.checkPermissions();
    if (status.display !== 'granted') return;

    const toSchedule: Array<{
      id: number;
      title: string;
      body: string;
      schedule: { at?: Date; on?: { hour: number; minute: number }; repeats?: boolean };
    }> = [];

    const idMap: Record<string, number> = {
      'partner-pms': ID_PARTNER_PMS,
      'partner-period-tomorrow': ID_PARTNER_TOMORROW,
      'partner-fertile-start': ID_PARTNER_FERTILE,
    };

    for (const alert of buildScheduledPartnerCareAlerts(snapshot)) {
      if (!alert.scheduleDate) continue;
      const [y, m, d] = alert.scheduleDate.split('-').map(Number);
      const atDate = new Date(y, m - 1, d, alert.hour ?? 9, alert.minute ?? 0, 0);
      if (atDate.getTime() > Date.now() + 60_000) {
        const msg = getSafeText(disguiseMode, customText, alert.title, alert.body);
        toSchedule.push({
          id: idMap[alert.id] ?? ID_PARTNER_PMS,
          ...msg,
          schedule: { at: atDate },
        });
      }
    }

    // Daily evening partner check-in reminder
    const checkinTime = watchConfig.dailyCheckinTime || '18:30';
    const [hour, minute] = checkinTime.split(':').map(Number);
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      const msg = getSafeText(
        disguiseMode,
        customText,
        `Evening check-in for ${snapshot.profileLabel}`,
        'Open LunaCycle Partner tab to see her phase, comfort cues, and how to support her tonight.',
      );
      toSchedule.push({
        id: ID_PARTNER_DAILY,
        ...msg,
        schedule: { on: { hour, minute }, repeats: true },
      });
    }

    if (toSchedule.length > 0) {
      await LocalNotifications.schedule({ notifications: toSchedule });
    }
  } catch {
    // Ignore native scheduling errors
  }
}

export async function sendTestPartnerCareNotification(
  title: string,
  body: string,
  disguiseMode: boolean,
  customText: string,
): Promise<boolean> {
  const msg = getSafeText(disguiseMode, customText, title, body);
  if (isNativeNotificationRuntime()) {
    try {
      const granted = await requestNativeNotificationPermission();
      if (!granted) return false;
      await LocalNotifications.schedule({
        notifications: [
          {
            id: ID_PARTNER_TEST,
            ...msg,
            schedule: { at: new Date(Date.now() + 1500) },
          },
        ],
      });
      return true;
    } catch {
      return false;
    }
  }
  if (typeof window !== 'undefined' && 'Notification' in window) {
    const perm =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
    if (perm === 'granted') {
      new Notification(msg.title, { body: msg.body, tag: 'lunacycle-partner-test' });
      return true;
    }
  }
  return false;
}

export async function sendTestPillAlarmNotification(
  pillsPerDay: number,
  disguiseMode: boolean,
  customText: string,
): Promise<boolean> {
  const doseLabel = pillsPerDay === 1 ? '1 pill' : `${pillsPerDay} pills`;
  const msg = getSafeText(
    disguiseMode,
    customText,
    'Daily Pill Alarm (Test)',
    `Time to take your daily dose (${doseLabel}).`,
  );
  if (isNativeNotificationRuntime()) {
    try {
      const granted = await requestNativeNotificationPermission();
      if (!granted) return false;
      await ensurePillAlarmChannel();
      await LocalNotifications.schedule({
        notifications: [
          {
            id: ID_PILL_TEST,
            ...msg,
            channelId: PILL_ALARM_CHANNEL_ID,
            schedule: { at: new Date(Date.now() + 1500), allowWhileIdle: true },
          },
        ],
      });
      return true;
    } catch {
      return false;
    }
  }
  if (typeof window !== 'undefined' && 'Notification' in window) {
    const perm =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
    if (perm === 'granted') {
      new Notification(msg.title, { body: msg.body, tag: 'lunacycle-pill-test' });
      return true;
    }
  }
  return false;
}

export async function scheduleNativePillSnooze(
  minutes: number,
  scheduledTime: string,
  pillsPerDay: number,
  disguiseMode: boolean,
  customText: string,
): Promise<void> {
  if (!isNativeNotificationRuntime()) return;
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display !== 'granted') return;
    await ensurePillAlarmChannel();
    const doseLabel = pillsPerDay === 1 ? '1 pill' : `${pillsPerDay} pills`;
    const msg = getSafeText(
      disguiseMode,
      customText,
      'Snoozed Pill Alarm',
      `Time to take your daily dose (${doseLabel}).`,
    );
    await LocalNotifications.schedule({
      notifications: [
        {
          id: ID_PILL_SNOOZE,
          ...msg,
          channelId: PILL_ALARM_CHANNEL_ID,
          extra: { type: 'pill_alarm', scheduledTime },
          schedule: { at: new Date(Date.now() + minutes * 60_000), allowWhileIdle: true },
        },
      ],
    });
  } catch {
    // Ignore
  }
}

export function subscribeNativePillAlarmTap(
  onTap: (scheduledTime: string) => void,
): () => void {
  if (!isNativeNotificationRuntime()) return () => {};
  let removed = false;
  let handle: { remove: () => Promise<void> } | null = null;

  void LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const extra = event.notification?.extra as { type?: string; scheduledTime?: string } | undefined;
    if (extra?.type === 'pill_alarm') {
      onTap(extra.scheduledTime || '');
    }
  }).then((h) => {
    if (removed) {
      void h.remove();
    } else {
      handle = h;
    }
  });

  return () => {
    removed = true;
    if (handle) void handle.remove();
  };
}
