import type { LunaData, TodaySummary } from '../types';
import { computePillPackStatus } from './hygieneTimer';
import { daysBetween, formatShortDate } from './temporal';

export interface ActiveReminder {
  id: string;
  tone: 'period' | 'fertile' | 'gentle';
  title: string;
  body: string;
}

export function computeActiveReminders(
  data: LunaData,
  summary: TodaySummary,
  latestPeriodStartDate?: string | null,
): ActiveReminder[] {
  const alerts: ActiveReminder[] = [];
  const { reminders } = data.settings;

  if (summary.mode !== 'pregnancy') {
    if (
      reminders.periodEnabled &&
      summary.nextPeriodDate &&
      !summary.isPeriodActiveToday
    ) {
      if (summary.daysLate > 0) {
        alerts.push({
          id: 'period-late',
          tone: 'period',
          title: `Period is ${summary.daysLate} ${summary.daysLate === 1 ? 'day' : 'days'} past predicted date`,
          body: 'Log bleeding if it has started, or note any stress, travel, or symptoms.',
        });
      } else if (
        summary.daysUntilNextPeriod !== null &&
        summary.daysUntilNextPeriod <= reminders.periodBeforeDays
      ) {
        alerts.push({
          id: 'period-soon',
          tone: 'period',
          title:
            summary.daysUntilNextPeriod === 0
              ? 'Period predicted to start today'
              : `Period predicted in ${summary.daysUntilNextPeriod} ${summary.daysUntilNextPeriod === 1 ? 'day' : 'days'}`,
          body: `Expected around ${formatShortDate(summary.nextPeriodDate)}.`,
        });
      } else if (
        reminders.pmsEnabled &&
        summary.daysUntilNextPeriod !== null &&
        summary.daysUntilNextPeriod > reminders.periodBeforeDays &&
        summary.daysUntilNextPeriod <= 5
      ) {
        alerts.push({
          id: 'pms-window',
          tone: 'gentle',
          title: `PMS window (${summary.daysUntilNextPeriod} days before period)`,
          body: 'Late-luteal dips in energy or mood are common — prioritize steady meals and rest.',
        });
      }
    }

    if (
      !data.settings.birthControlMode &&
      reminders.fertileEnabled &&
      summary.fertileStartDate &&
      summary.ovulationDate
    ) {
      const daysToFertile = daysBetween(summary.today, summary.fertileStartDate);
      if (summary.phase === 'ovulation') {
        alerts.push({
          id: 'ovulation-peak',
          tone: 'fertile',
          title: 'Estimated ovulation day',
          body: 'Peak fertility window today. Log mucus or LH test for sharper tracking.',
        });
      } else if (summary.phase === 'fertile') {
        alerts.push({
          id: 'fertile-active',
          tone: 'fertile',
          title: 'Inside fertile window',
          body: `Estimated ovulation around ${formatShortDate(summary.ovulationDate)}.`,
        });
      } else if (daysToFertile === 1) {
        alerts.push({
          id: 'fertile-tomorrow',
          tone: 'fertile',
          title: 'Fertile window starts tomorrow',
          body: `Projected ${formatShortDate(summary.fertileStartDate)} – ${formatShortDate(summary.fertileEndDate ?? summary.ovulationDate)}.`,
        });
      }
    }
  }

  if (reminders.dailyLogEnabled) {
    const todayLog = data.logs[summary.today];
    const hasLoggedToday =
      Boolean(todayLog) &&
      (todayLog.flow !== 'none' ||
        todayLog.symptoms.length > 0 ||
        todayLog.moods.length > 0 ||
        todayLog.notes.trim().length > 0);
    if (!hasLoggedToday) {
      alerts.push({
        id: 'daily-checkin',
        tone: 'gentle',
        title: 'Daily check-in reminder',
        body: `Scheduled for ${reminders.dailyLogTime}. Take 10 seconds to log how you feel today.`,
      });
    }
  }

  if (data.settings.pillPack.enabled && !data.settings.simpleMode) {
    const pillStatus = computePillPackStatus(
      data.settings.pillPack,
      summary.today,
      latestPeriodStartDate,
    );
    if (pillStatus.needsRefill) {
      alerts.push({
        id: 'pill-refill',
        tone: 'period',
        title: 'Pill pack refill reminder',
        body: `Only ${pillStatus.pillsRemaining} ${pillStatus.pillsRemaining === 1 ? 'pill' : 'pills'} (${pillStatus.daysRemainingInPack} ${pillStatus.daysRemainingInPack === 1 ? 'day' : 'days'}) left in your current pack — remember to refill soon.`,
      });
    }
  }

  return alerts;
}

export function getNotificationSupport(): 'unsupported' | NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<'unsupported' | NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.requestPermission();
}

export function dispatchGentleBrowserNotification(
  title: string,
  body: string,
  disguiseMode: boolean,
): void {
  if (getNotificationSupport() !== 'granted') return;
  const safeTitle = disguiseMode ? 'Daily Notes Reminder' : title;
  const safeBody = disguiseMode ? 'You have a scheduled note check-in.' : body;
  new Notification(safeTitle, {
    body: safeBody,
    tag: 'lunacycle-reminder',
    silent: false,
  });
}
