import type { PartnerSnapshot } from '../types';
import { addDays } from './temporal';

export interface PartnerCareAlert {
  id: string;
  title: string;
  body: string;
  scheduleDate?: string; // YYYY-MM-DD (for future scheduled notifications)
  hour?: number;
  minute?: number;
}

/**
 * Generates an immediate, actionable "what to check on & how to help" alert
 * based on the partner's latest synced snapshot (symptoms, mood, phase, or pregnancy).
 */
export function buildImmediatePartnerCareAlert(snapshot: PartnerSnapshot): PartnerCareAlert | null {
  const name = snapshot.profileLabel || 'your partner';
  const symptoms = new Set(snapshot.todaySymptoms ?? []);
  const moods = new Set(snapshot.todayMoods ?? []);

  if (symptoms.has('cramps') || symptoms.has('backache')) {
    return {
      id: `sym-cramps-${snapshot.asOfDate}`,
      title: `Comfort check-in for ${name}`,
      body: 'She logged cramps or backache today — offer a warm heating pad, tea, and take evening chores off her plate.',
    };
  }

  if (symptoms.has('headache') || symptoms.has('nausea')) {
    return {
      id: `sym-headache-${snapshot.asOfDate}`,
      title: `Gentle care cue for ${name}`,
      body: 'She logged headache or nausea today — offer water, keep lighting calm, and avoid heavy scents or loud plans.',
    };
  }

  if (symptoms.has('fatigue') || symptoms.has('insomnia')) {
    return {
      id: `sym-fatigue-${snapshot.asOfDate}`,
      title: `Low-energy cue for ${name}`,
      body: 'She logged fatigue today — keep tonight flexible and help her wind down early.',
    };
  }

  if (moods.has('sensitive') || moods.has('anxious') || moods.has('irritable') || moods.has('low')) {
    return {
      id: `mood-tender-${snapshot.asOfDate}`,
      title: `Check in warmly on ${name}`,
      body: 'She is feeling extra tender today — listen without rushing to fix, and share one thing you appreciate about her.',
    };
  }

  if (snapshot.mode === 'pregnancy' && snapshot.pregnancy) {
    return {
      id: `preg-wk-${snapshot.pregnancy.weeks}`,
      title: `Week ${snapshot.pregnancy.weeks} check-in for ${name}`,
      body:
        snapshot.pregnancy.trimester === 1
          ? 'Keep light snacks and water handy, and protect extra rest time today.'
          : snapshot.pregnancy.trimester === 2
            ? 'Check in on her comfort and hydration — great week for a gentle walk together.'
            : 'Help with lifting, errands, and comfortable rest pillows as due date approaches.',
    };
  }

  if (snapshot.isPeriodActiveToday) {
    return {
      id: `period-active-${snapshot.asOfDate}`,
      title: `Check in on ${name} today`,
      body: 'Her period is active — ask if she wants a warm meal, comfort snacks, or a cozy night in.',
    };
  }

  return null;
}

/**
 * Generates upcoming scheduled partner care notifications (PMS window, period tomorrow,
 * fertile/high-energy window) so Android OS can fire them even when the app is closed.
 */
export function buildScheduledPartnerCareAlerts(snapshot: PartnerSnapshot): PartnerCareAlert[] {
  if (snapshot.mode === 'pregnancy') return [];
  const name = snapshot.profileLabel || 'your partner';
  const list: PartnerCareAlert[] = [];

  if (snapshot.nextPeriodDate) {
    // 3 days before predicted period -> PMS window heads-up
    list.push({
      id: 'partner-pms',
      title: `PMS window starting for ${name}`,
      body: 'Extra patience, comfort snacks, and lighter evening plans go a long way over the next few days.',
      scheduleDate: addDays(snapshot.nextPeriodDate, -3),
      hour: 9,
      minute: 0,
    });

    // 1 day before predicted period -> Period prep reminder
    list.push({
      id: 'partner-period-tomorrow',
      title: `${name}'s period expected tomorrow`,
      body: 'Check that comfort essentials, warm drinks, and a flexible evening are ready.',
      scheduleDate: addDays(snapshot.nextPeriodDate, -1),
      hour: 9,
      minute: 0,
    });
  }

  if (snapshot.fertileStartDate) {
    list.push({
      id: 'partner-fertile-start',
      title: `High-energy window for ${name}`,
      body:
        snapshot.mode === 'ttc'
          ? 'Her fertile window is starting — plan calm, unhurried quality time together.'
          : 'Her energy often peaks over the next few days — great time to spin the Date Idea Wheel!',
      scheduleDate: snapshot.fertileStartDate,
      hour: 10,
      minute: 0,
    });
  }

  return list;
}
