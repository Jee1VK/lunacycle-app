/**
 * True Native Android & iOS Local Notifications via @capacitor/local-notifications.
 * Defaults to VISIBILITY_PRIVATE (0) and discreet generic text on lock screens so
 * period, ovulation, fertility, and pill alerts never leak on locked screens or smartwatches.
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

const PRIVATE_REMINDER_CHANNEL_ID = 'lunacycle_reminders_private';
const PILL_ALARM_CHANNEL_ID = 'lunacycle_pill_alarm_private';
const LEGACY_PUBLIC_PILL_CHANNEL_ID = 'lunacycle_pill_alarm';

async function ensurePrivateNotificationChannels(): Promise<void> {
  if (!isNativeNotificationRuntime()) return;
  try {
    // Remove legacy public-visibility channel if present from earlier builds
    await LocalNotifications.deleteChannel({ id: LEGACY_PUBLIC_PILL_CHANNEL_ID }).catch(() => {});
    await LocalNotifications.createChannel({
      id: PRIVATE_REMINDER_CHANNEL_ID,
      name: 'Private Cycle & Wellness Reminders',
      description: 'Lock-screen redacted private wellness reminders',
      importance: 3,
      visibility: 0, // VISIBILITY_PRIVATE — hides sensitive content on locked screen
      vibration: true,
    });
    await LocalNotifications.createChannel({
      id: PILL_ALARM_CHANNEL_ID,
      name: 'Daily Pill Reminder',
      description: 'High-priority daily pill pack time and refill reminders',
      importance: 5,
      visibility: 0, // VISIBILITY_PRIVATE — hides sensitive content on locked screen
      vibration: true,
    });
  } catch {
    // Ignore on platforms where Android channels are unsupported (e.g. iOS)
  }
}

export function isNativeNotificationRuntime(): boolean {
  return Capacitor.isNativePlatform();
}

export async function requestNativeNotificationPermission(): Promise<boolean> {
  if (!isNativeNotificationRuntime()) return false;
  try {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display === 'granted') {
      await ensurePrivateNotificationChannels();
    }
    return perm.display === 'granted';
  } catch {
    return false;
  }
}

export function getSafeNotificationText(
  disguiseMode: boolean,
  showLockScreenDetails: boolean,
  customText: string,
  defaultTitle: string,
  defaultBody: string,
  kind: 'general' | 'pill' = 'general',
): { title: string; body: string } {
  const custom = customText.trim();
  if (disguiseMode) {
    return {
      title: 'Daily Notes',
      body: custom || 'You have a scheduled note check-in.',
    };
  }
  if (custom) {
    return { title: 'LunaCycle', body: custom };
  }
  if (!showLockScreenDetails) {
    return kind === 'pill'
      ? { title: 'LunaCycle Reminder', body: 'Time for your scheduled daily reminder.' }
      : { title: 'LunaCycle', body: 'You have a private scheduled check-in.' };
  }
  return { title: defaultTitle, body: defaultBody };
}

export async function cancelAllNativeNotifications(): Promise<void> {
  if (!isNativeNotificationRuntime()) return;
  try {
    const pending = await LocalNotifications.getPending();
    const pendingIds = (pending.notifications ?? []).map((n) => ({ id: n.id }));
    const staticIds = [
      { id: ID_PERIOD },
      { id: ID_DAILY_LOG },
      { id: ID_PILL },
      { id: ID_HYGIENE },
      { id: ID_PILL_REFILL },
      { id: ID_PILL_TEST },
      { id: ID_PILL_SNOOZE },
      { id: ID_PARTNER_PMS },
      { id: ID_PARTNER_TOMORROW },
      { id: ID_PARTNER_FERTILE },
      { id: ID_PARTNER_DAILY },
      { id: ID_PARTNER_TEST },
      ...Array.from({ length: 32 }, (_, i) => ({ id: ID_PILL_SLOT_BASE + i })),
    ];
    await LocalNotifications.cancel({ notifications: [...pendingIds, ...staticIds] });
  } catch {
    // Ignore native cancel errors
  }
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

    await ensurePrivateNotificationChannels();

    const pillSlotCancels = Array.from({ length: 32 }, (_, i) => ({ id: ID_PILL_SLOT_BASE + i }));
    await LocalNotifications.cancel({
      notifications: [
        { id: ID_PERIOD },
        { id: ID_DAILY_LOG },
        { id: ID_PILL },
        { id: ID_PILL_REFILL },
        { id: ID_PILL_SNOOZE },
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
    const showDetails = Boolean(reminders.showLockScreenDetails);

    // 1. Period Approaching (9:00 AM local time N days before predicted period)
    if (reminders.periodEnabled && summary.mode !== 'pregnancy' && summary.nextPeriodDate) {
      const targetIso = addDays(summary.nextPeriodDate, -reminders.periodBeforeDays);
      const [y, m, d] = targetIso.split('-').map(Number);
      const atDate = new Date(y, m - 1, d, 9, 0, 0);
      if (atDate.getTime() > Date.now() + 60_000) {
        const msg = getSafeNotificationText(
          disguiseMode,
          showDetails,
          reminders.customNotificationText,
          'LunaCycle Reminder',
          `Period expected in ${reminders.periodBeforeDays} days.`,
        );
        toSchedule.push({
          id: ID_PERIOD,
          ...msg,
          channelId: PRIVATE_REMINDER_CHANNEL_ID,
          schedule: { at: atDate },
        });
      }
    }

    // 2. Daily Symptom Check-In
    if (reminders.dailyLogEnabled) {
      const [hour, minute] = reminders.dailyLogTime.split(':').map(Number);
      if (Number.isFinite(hour) && Number.isFinite(minute)) {
        const msg = getSafeNotificationText(
          disguiseMode,
          showDetails,
          reminders.customNotificationText,
          'Daily Check-In',
          'Take 10 seconds to log how you feel today.',
        );
        toSchedule.push({
          id: ID_DAILY_LOG,
          ...msg,
          channelId: PRIVATE_REMINDER_CHANNEL_ID,
          schedule: { on: { hour, minute }, repeats: true },
        });
      }
    }

    // 3. Daily Pill Pack Reminders (7-day exact AlarmManager slots for 1..4 daily times) & Refill Reminder
    if (pillPack.enabled && !data.settings.simpleMode) {
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
          if (pillPack.takenDates.includes(targetIso)) continue;
          const [ty, tm, td] = targetIso.split('-').map(Number);

          for (const timeStr of reminderTimes) {
            if (slotIdx >= 32) break;
            const [hour, minute] = timeStr.split(':').map(Number);
            if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue;
            const fireAt = new Date(ty, tm - 1, td, hour, minute, 0, 0);
            if (fireAt.getTime() <= now.getTime() + 2000) continue;

            const msg = getSafeNotificationText(
              disguiseMode,
              showDetails,
              reminders.customNotificationText,
              'Daily Pill Reminder',
              `Time for your daily pill pack reminder (${doseLabel}) — ${timeStr}.`,
              'pill',
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
          const msg = getSafeNotificationText(
            disguiseMode,
            showDetails,
            reminders.customNotificationText,
            'Pill Pack Refill Reminder',
            `Only ${threshold} ${threshold === 1 ? 'day' : 'days'} left in your pack — remember to refill soon.`,
            'pill',
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
  showLockScreenDetails = false,
): Promise<void> {
  if (!isNativeNotificationRuntime()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: ID_HYGIENE }] });
    if (!timer) return;

    const status = await LocalNotifications.checkPermissions();
    if (status.display !== 'granted') return;
    await ensurePrivateNotificationChannels();

    const atDate = new Date(timer.endsAt);
    if (atDate.getTime() <= Date.now() + 5_000) return;

    const msg = getSafeNotificationText(
      disguiseMode,
      showLockScreenDetails,
      customText,
      'Hygiene Change Reminder',
      `Your ${timer.durationHours}h ${timer.product} timer is up.`,
    );
    await LocalNotifications.schedule({
      notifications: [
        {
          id: ID_HYGIENE,
          ...msg,
          channelId: PRIVATE_REMINDER_CHANNEL_ID,
          schedule: { at: atDate },
        },
      ],
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
  showLockScreenDetails = false,
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
    await ensurePrivateNotificationChannels();

    const toSchedule: Array<{
      id: number;
      title: string;
      body: string;
      channelId?: string;
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
        const msg = getSafeNotificationText(
          disguiseMode,
          showLockScreenDetails,
          customText,
          alert.title,
          alert.body,
        );
        toSchedule.push({
          id: idMap[alert.id] ?? ID_PARTNER_PMS,
          ...msg,
          channelId: PRIVATE_REMINDER_CHANNEL_ID,
          schedule: { at: atDate },
        });
      }
    }

    const checkinTime = watchConfig.dailyCheckinTime || '18:30';
    const [hour, minute] = checkinTime.split(':').map(Number);
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      const msg = getSafeNotificationText(
        disguiseMode,
        showLockScreenDetails,
        customText,
        `Evening check-in for ${snapshot.profileLabel}`,
        'Open LunaCycle Partner tab to see comfort cues and how to support tonight.',
      );
      toSchedule.push({
        id: ID_PARTNER_DAILY,
        ...msg,
        channelId: PRIVATE_REMINDER_CHANNEL_ID,
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
  showLockScreenDetails = false,
): Promise<boolean> {
  const msg = getSafeNotificationText(
    disguiseMode,
    showLockScreenDetails,
    customText,
    title,
    body,
  );
  if (isNativeNotificationRuntime()) {
    try {
      const granted = await requestNativeNotificationPermission();
      if (!granted) return false;
      await LocalNotifications.schedule({
        notifications: [
          {
            id: ID_PARTNER_TEST,
            ...msg,
            channelId: PRIVATE_REMINDER_CHANNEL_ID,
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
  showLockScreenDetails = false,
): Promise<boolean> {
  const doseLabel = pillsPerDay === 1 ? '1 pill' : `${pillsPerDay} pills`;
  const msg = getSafeNotificationText(
    disguiseMode,
    showLockScreenDetails,
    customText,
    'Daily Pill Reminder (Test)',
    `Time for your daily pill pack reminder (${doseLabel}).`,
    'pill',
  );
  if (isNativeNotificationRuntime()) {
    try {
      const granted = await requestNativeNotificationPermission();
      if (!granted) return false;
      await ensurePrivateNotificationChannels();
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
  showLockScreenDetails = false,
): Promise<void> {
  if (!isNativeNotificationRuntime()) return;
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display !== 'granted') return;
    await ensurePrivateNotificationChannels();
    const doseLabel = pillsPerDay === 1 ? '1 pill' : `${pillsPerDay} pills`;
    const msg = getSafeNotificationText(
      disguiseMode,
      showLockScreenDetails,
      customText,
      'Snoozed Pill Reminder',
      `Time for your daily pill pack reminder (${doseLabel}).`,
      'pill',
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
