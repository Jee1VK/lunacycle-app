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
import { buildScheduledPartnerCareAlerts } from './partnerNotifications';
import { addDays } from './temporal';

const ID_PERIOD = 1001;
const ID_DAILY_LOG = 1002;
const ID_PILL = 1003;
const ID_HYGIENE = 1004;
const ID_PARTNER_PMS = 2001;
const ID_PARTNER_TOMORROW = 2002;
const ID_PARTNER_FERTILE = 2003;
const ID_PARTNER_DAILY = 2004;
const ID_PARTNER_TEST = 2005;

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
): Promise<void> {
  if (!isNativeNotificationRuntime()) return;
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display !== 'granted') return;

    await LocalNotifications.cancel({
      notifications: [{ id: ID_PERIOD }, { id: ID_DAILY_LOG }, { id: ID_PILL }],
    });

    const toSchedule: Array<{
      id: number;
      title: string;
      body: string;
      schedule: { at?: Date; on?: { hour: number; minute: number }; repeats?: boolean };
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

    // 3. Daily Pill Reminder
    if (pillPack.enabled) {
      const [hour, minute] = pillPack.reminderTime.split(':').map(Number);
      if (Number.isFinite(hour) && Number.isFinite(minute)) {
        const msg = getSafeText(
          disguiseMode,
          reminders.customNotificationText,
          'Daily Pill Reminder',
          'Time to log your daily pill.',
        );
        toSchedule.push({
          id: ID_PILL,
          ...msg,
          schedule: { on: { hour, minute }, repeats: true },
        });
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
