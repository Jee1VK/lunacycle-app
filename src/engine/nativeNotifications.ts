/**
 * True Native Android OS Local Notifications via @capacitor/local-notifications.
 * Safely no-ops on web browsers while scheduling real OS-level notifications
 * inside the installed LunaCycle Android APK so reminders fire even when closed.
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { ActiveHygieneTimer, LunaData, TodaySummary } from '../types';
import { addDays } from './temporal';

const ID_PERIOD = 1001;
const ID_DAILY_LOG = 1002;
const ID_PILL = 1003;
const ID_HYGIENE = 1004;

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
