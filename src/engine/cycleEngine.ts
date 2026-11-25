import type {
  CyclePhase,
  CycleStats,
  DailyLog,
  DayClassification,
  FlowLevel,
  PeriodSpan,
  PhaseSymptomInsight,
  PregnancySummary,
  SymptomId,
  TodaySummary,
  UserSettings,
} from '../types';
import { addDays, compareDates, daysBetween } from './temporal';

const VALID_CYCLE_MIN = 18;
const VALID_CYCLE_MAX = 60;
const SAME_PERIOD_MAX_GAP_DAYS = 2; // 1-day pause mid-period stays in the same span

export function isActiveBleedingFlow(flow: FlowLevel): boolean {
  return flow === 'light' || flow === 'medium' || flow === 'heavy';
}

export function isAnyFlow(flow: FlowLevel): boolean {
  return flow !== 'none';
}

export function hasNonFlowLogDetails(log: DailyLog | undefined): boolean {
  if (!log) return false;
  return (
    log.symptoms.length > 0 ||
    (log.customSymptoms?.length ?? 0) > 0 ||
    log.moods.length > 0 ||
    (log.customMoods?.length ?? 0) > 0 ||
    log.mucus !== 'none' ||
    log.lhTest !== 'none' ||
    typeof log.bbtC === 'number' ||
    typeof log.sleepHours === 'number' ||
    typeof log.waterGlasses === 'number' ||
    Boolean(log.sexLogged) ||
    (log.hygieneChanges?.length ?? 0) > 0 ||
    log.notes.trim().length > 0
  );
}

/**
 * Extracts chronological period spans from daily logs.
 * Active bleeding (`light`, `medium`, `heavy`) anchors a period; adjacent
 * `spotting` (within 1 day of active bleeding) extends that period without
 * letting isolated mid-cycle spotting trigger a false new cycle.
 */
export function extractPeriods(logs: Record<string, DailyLog>): PeriodSpan[] {
  const activeDates = Object.values(logs)
    .filter((log) => isActiveBleedingFlow(log.flow))
    .map((log) => log.date)
    .sort(compareDates);

  if (activeDates.length === 0) return [];

  const spans: Array<{ startDate: string; endDate: string }> = [];
  let currentStart = activeDates[0];
  let currentEnd = activeDates[0];

  for (let i = 1; i < activeDates.length; i++) {
    const date = activeDates[i];
    if (daysBetween(currentEnd, date) <= SAME_PERIOD_MAX_GAP_DAYS) {
      currentEnd = date;
    } else {
      spans.push({ startDate: currentStart, endDate: currentEnd });
      currentStart = date;
      currentEnd = date;
    }
  }
  spans.push({ startDate: currentStart, endDate: currentEnd });

  // Extend span edges by 1 day if adjacent spotting was logged
  for (const span of spans) {
    const dayBefore = addDays(span.startDate, -1);
    if (logs[dayBefore]?.flow === 'spotting') {
      span.startDate = dayBefore;
    }
    const dayAfter = addDays(span.endDate, 1);
    if (logs[dayAfter]?.flow === 'spotting') {
      span.endDate = dayAfter;
    }
  }

  return spans.map((span, idx) => {
    const next = spans[idx + 1];
    return {
      startDate: span.startDate,
      endDate: span.endDate,
      lengthDays: daysBetween(span.startDate, span.endDate) + 1,
      cycleLengthToNext: next ? daysBetween(span.startDate, next.startDate) : null,
    };
  });
}

export function computeCycleStats(
  logs: Record<string, DailyLog>,
  settings: UserSettings,
): CycleStats {
  const periods = extractPeriods(logs);
  const completedCycleLengths = periods
    .map((p) => p.cycleLengthToNext)
    .filter((len): len is number => len !== null && len > 0);

  const validForPrediction = completedCycleLengths
    .filter((len) => len >= VALID_CYCLE_MIN && len <= VALID_CYCLE_MAX)
    .slice(-6);

  let averageCycleLength = settings.defaultCycleLength;
  if (validForPrediction.length > 0) {
    // Weighted rolling average: more recent cycles carry modestly more weight
    let weightedSum = 0;
    let totalWeight = 0;
    validForPrediction.forEach((len, idx) => {
      const weight = 1 + idx * 0.2;
      weightedSum += len * weight;
      totalWeight += weight;
    });
    averageCycleLength = Math.round(weightedSum / totalWeight);
  }

  const recentPeriodLengths = periods
    .slice(-6)
    .map((p) => p.lengthDays)
    .filter((len) => len >= 1 && len <= 14);

  const averagePeriodLength =
    recentPeriodLengths.length > 0
      ? Math.max(
          2,
          Math.min(
            10,
            Math.round(
              recentPeriodLengths.reduce((acc, n) => acc + n, 0) /
                recentPeriodLengths.length,
            ),
          ),
        )
      : settings.defaultPeriodLength;

  const recentCycles = completedCycleLengths.slice(-6);
  const minCycleLength = recentCycles.length > 0 ? Math.min(...recentCycles) : null;
  const maxCycleLength = recentCycles.length > 0 ? Math.max(...recentCycles) : null;
  const variationDays =
    minCycleLength !== null && maxCycleLength !== null
      ? maxCycleLength - minCycleLength
      : null;

  let regularity: CycleStats['regularity'] = 'learning';
  if (recentCycles.length >= 2 && variationDays !== null) {
    if (variationDays <= 7 && averageCycleLength >= 21 && averageCycleLength <= 35) {
      regularity = 'regular';
    } else if (variationDays <= 12 && averageCycleLength >= 19 && averageCycleLength <= 40) {
      regularity = 'slightly_variable';
    } else {
      regularity = 'irregular';
    }
  }

  return {
    periods,
    completedCycleLengths,
    averageCycleLength,
    averagePeriodLength,
    minCycleLength,
    maxCycleLength,
    variationDays,
    regularity,
    hasLoggedPeriods: periods.length > 0,
  };
}

/**
 * Finds an LH peak logged in a cycle starting at `cycleStart` (between cycle day 7 and 28).
 * If found, ovulation is estimated as LH peak + 1 day for that cycle.
 */
function findLhOvulationOverride(
  logs: Record<string, DailyLog>,
  cycleStart: string,
  cycleEndExclusive: string,
): string | null {
  const candidates = Object.values(logs)
    .filter(
      (log) =>
        log.lhTest === 'peak' &&
        compareDates(log.date, addDays(cycleStart, 6)) >= 0 &&
        compareDates(log.date, cycleEndExclusive) < 0,
    )
    .map((log) => log.date)
    .sort(compareDates);

  if (candidates.length === 0) return null;
  return addDays(candidates[candidates.length - 1], 1);
}

export function getCycleOvulationDate(
  logs: Record<string, DailyLog>,
  cycleStart: string,
  nextPeriodStart: string,
  lutealLength: number,
): string {
  const override = findLhOvulationOverride(logs, cycleStart, nextPeriodStart);
  if (override) return override;
  return addDays(nextPeriodStart, -lutealLength);
}

const PREGNANCY_MILESTONES: Array<{ maxWeek: number; text: string }> = [
  { maxWeek: 5, text: 'Early implantation and neural tube formation begin.' },
  { maxWeek: 8, text: 'Tiny heartbeat develops; foundational organ buds form.' },
  { maxWeek: 12, text: 'End of first trimester — major structures are in place.' },
  { maxWeek: 16, text: 'Second trimester begins; energy often starts to stabilize.' },
  { maxWeek: 20, text: 'Halfway milestone — anatomy scan window and early flutters.' },
  { maxWeek: 24, text: 'Hearing develops and sleep-wake rhythms emerge.' },
  { maxWeek: 28, text: 'Third trimester starts — rapid brain growth and active kicks.' },
  { maxWeek: 32, text: 'Practicing breathing movements and building healthy reserves.' },
  { maxWeek: 36, text: 'Settling head-down as full-term readiness approaches.' },
  { maxWeek: 42, text: 'Full term window — stay closely connected with your care provider.' },
];

export function computePregnancySummary(
  today: string,
  settings: UserSettings,
): PregnancySummary | null {
  if (settings.mode !== 'pregnancy') return null;

  let lmpDate = settings.pregnancyLmpDate;
  let dueDate = settings.pregnancyDueDate;

  if (!lmpDate && dueDate) {
    lmpDate = addDays(dueDate, -280);
  } else if (lmpDate && !dueDate) {
    dueDate = addDays(lmpDate, 280);
  }

  if (!lmpDate || !dueDate) return null;

  const rawDays = daysBetween(lmpDate, today);
  const gestationalDays = Math.max(0, Math.min(300, rawDays));
  const weeks = Math.floor(gestationalDays / 7);
  const days = gestationalDays % 7;
  const trimester: 1 | 2 | 3 = weeks < 13 ? 1 : weeks < 28 ? 2 : 3;
  const daysRemaining = Math.max(0, daysBetween(today, dueDate));
  const progressPercent = Math.max(0, Math.min(100, Math.round((gestationalDays / 280) * 100)));
  const milestone =
    PREGNANCY_MILESTONES.find((m) => weeks <= m.maxWeek)?.text ??
    PREGNANCY_MILESTONES[PREGNANCY_MILESTONES.length - 1].text;

  return {
    lmpDate,
    dueDate,
    gestationalDays,
    weeks,
    days,
    trimester,
    daysRemaining,
    progressPercent,
    milestone,
  };
}

export function classifyDate(
  date: string,
  logs: Record<string, DailyLog>,
  stats: CycleStats,
  settings: UserSettings,
  today: string,
): DayClassification {
  const log = logs[date];
  const hasLogDetails = hasNonFlowLogDetails(log);

  if (settings.mode === 'pregnancy') {
    const isLoggedPeriod = Boolean(log && isActiveBleedingFlow(log.flow));
    return {
      date,
      phase: 'pregnancy',
      cycleDay: null,
      isLoggedPeriod,
      isPredictedPeriod: false,
      isFertile: false,
      isOvulation: false,
      isLatePeriod: false,
      daysLate: 0,
      hasLogDetails,
    };
  }

  // 1. Check if date falls inside an actual logged period span
  for (const span of stats.periods) {
    if (compareDates(date, span.startDate) >= 0 && compareDates(date, span.endDate) <= 0) {
      return {
        date,
        phase: 'menstrual',
        cycleDay: daysBetween(span.startDate, date) + 1,
        isLoggedPeriod: true,
        isPredictedPeriod: false,
        isFertile: false,
        isOvulation: false,
        isLatePeriod: false,
        daysLate: 0,
        hasLogDetails,
      };
    }
  }

  // 2. No logged periods yet -> neutral baseline
  if (stats.periods.length === 0) {
    return {
      date,
      phase: 'follicular',
      cycleDay: null,
      isLoggedPeriod: false,
      isPredictedPeriod: false,
      isFertile: false,
      isOvulation: false,
      isLatePeriod: false,
      daysLate: 0,
      hasLogDetails,
    };
  }

  // 3. Find the cycle containing `date`
  const firstPeriod = stats.periods[0];
  if (compareDates(date, firstPeriod.startDate) < 0) {
    return {
      date,
      phase: 'follicular',
      cycleDay: null,
      isLoggedPeriod: false,
      isPredictedPeriod: false,
      isFertile: false,
      isOvulation: false,
      isLatePeriod: false,
      daysLate: 0,
      hasLogDetails,
    };
  }

  let cycleStart = firstPeriod.startDate;
  let nextCycleStart: string | null = null;
  let isAfterLastLoggedPeriod = true;

  for (let i = 0; i < stats.periods.length; i++) {
    const p = stats.periods[i];
    const next = stats.periods[i + 1];
    if (compareDates(date, p.startDate) >= 0) {
      cycleStart = p.startDate;
      if (next && compareDates(date, next.startDate) < 0) {
        nextCycleStart = next.startDate;
        isAfterLastLoggedPeriod = false;
        break;
      } else if (!next) {
        isAfterLastLoggedPeriod = true;
      }
    }
  }

  const cycleLen = stats.averageCycleLength;
  const periodLen = stats.averagePeriodLength;
  const lutealLen = settings.lutealLength;

  const hideFertility = settings.birthControlMode || settings.simpleMode;

  if (!isAfterLastLoggedPeriod && nextCycleStart) {
    const cycleDay = daysBetween(cycleStart, date) + 1;
    const ovDate = getCycleOvulationDate(logs, cycleStart, nextCycleStart, lutealLen);
    const fertileStart = addDays(ovDate, -5);
    const fertileEnd = addDays(ovDate, 1);

    const isOvulation = !hideFertility && compareDates(date, ovDate) === 0;
    const isFertile =
      !hideFertility &&
      compareDates(date, fertileStart) >= 0 &&
      compareDates(date, fertileEnd) <= 0;

    let phase: CyclePhase = 'follicular';
    if (isOvulation) phase = 'ovulation';
    else if (isFertile) phase = 'fertile';
    else if (compareDates(date, fertileEnd) > 0) phase = 'luteal';

    return {
      date,
      phase,
      cycleDay,
      isLoggedPeriod: false,
      isPredictedPeriod: false,
      isFertile,
      isOvulation,
      isLatePeriod: false,
      daysLate: 0,
      hasLogDetails,
    };
  }

  // After the latest logged period: handle ongoing cycle (including late period) and future projected cycles
  const daysSinceLastStart = daysBetween(cycleStart, date);
  const firstPredictedPeriodStart = addDays(cycleStart, cycleLen);

  // If today is past expected period start and user hasn't logged a new period yet:
  const isTodayLate = compareDates(today, firstPredictedPeriodStart) > 0;
  if (isTodayLate && compareDates(date, today) <= 0 && compareDates(date, firstPredictedPeriodStart) >= 0) {
    const daysLate = daysBetween(firstPredictedPeriodStart, date);
    return {
      date,
      phase: 'luteal',
      cycleDay: daysSinceLastStart + 1,
      isLoggedPeriod: false,
      isPredictedPeriod: false,
      isFertile: false,
      isOvulation: false,
      isLatePeriod: true,
      daysLate,
      hasLogDetails,
    };
  }

  // Project forward in repeating cycleLen intervals
  let projectedCycleIndex = Math.floor(daysSinceLastStart / cycleLen);
  if (projectedCycleIndex < 0) projectedCycleIndex = 0;

  // If currently late, anchor future predictions from tomorrow so future months stay sensible
  let projectedCycleStart = addDays(cycleStart, projectedCycleIndex * cycleLen);
  if (isTodayLate && compareDates(date, today) > 0) {
    const daysAfterTomorrow = daysBetween(addDays(today, 1), date);
    const futureIdx = Math.floor(daysAfterTomorrow / cycleLen);
    projectedCycleStart = addDays(addDays(today, 1), futureIdx * cycleLen);
    projectedCycleIndex = futureIdx + 1;
  }

  const dayInProjectedCycle = daysBetween(projectedCycleStart, date);
  const projectedNextStart = addDays(projectedCycleStart, cycleLen);
  const isPredictedPeriod =
    projectedCycleIndex >= 1 && dayInProjectedCycle >= 0 && dayInProjectedCycle < periodLen;

  const ovDate = getCycleOvulationDate(logs, projectedCycleStart, projectedNextStart, lutealLen);
  const fertileStart = addDays(ovDate, -5);
  const fertileEnd = addDays(ovDate, 1);

  const isOvulation =
    !hideFertility && !isPredictedPeriod && compareDates(date, ovDate) === 0;
  const isFertile =
    !hideFertility &&
    !isPredictedPeriod &&
    compareDates(date, fertileStart) >= 0 &&
    compareDates(date, fertileEnd) <= 0;

  let phase: CyclePhase = 'follicular';
  if (isPredictedPeriod) phase = 'predicted_period';
  else if (isOvulation) phase = 'ovulation';
  else if (isFertile) phase = 'fertile';
  else if (compareDates(date, fertileEnd) > 0) phase = 'luteal';

  return {
    date,
    phase,
    cycleDay: dayInProjectedCycle + 1,
    isLoggedPeriod: false,
    isPredictedPeriod,
    isFertile,
    isOvulation,
    isLatePeriod: false,
    daysLate: 0,
    hasLogDetails,
  };
}

export function computeTodaySummary(
  today: string,
  logs: Record<string, DailyLog>,
  stats: CycleStats,
  settings: UserSettings,
): TodaySummary {
  const pregnancy = computePregnancySummary(today, settings);
  if (settings.mode === 'pregnancy') {
    return {
      today,
      mode: 'pregnancy',
      phase: 'pregnancy',
      cycleDay: null,
      daysUntilNextPeriod: null,
      daysLate: 0,
      nextPeriodDate: null,
      ovulationDate: null,
      fertileStartDate: null,
      fertileEndDate: null,
      isPeriodActiveToday: Boolean(logs[today] && isActiveBleedingFlow(logs[today].flow)),
      pregnancy,
    };
  }

  const todayClass = classifyDate(today, logs, stats, settings, today);
  const isPeriodActiveToday = Boolean(logs[today] && isActiveBleedingFlow(logs[today].flow));

  if (stats.periods.length === 0) {
    return {
      today,
      mode: settings.mode,
      phase: 'follicular',
      cycleDay: null,
      daysUntilNextPeriod: null,
      daysLate: 0,
      nextPeriodDate: null,
      ovulationDate: null,
      fertileStartDate: null,
      fertileEndDate: null,
      isPeriodActiveToday,
      pregnancy: null,
    };
  }

  const lastPeriod = stats.periods[stats.periods.length - 1];
  const expectedNextPeriod = addDays(lastPeriod.startDate, stats.averageCycleLength);
  const diffToNext = daysBetween(today, expectedNextPeriod);

  const daysLate = diffToNext < 0 ? Math.abs(diffToNext) : 0;
  const daysUntilNextPeriod = diffToNext >= 0 ? diffToNext : 0;

  const ovDate = getCycleOvulationDate(
    logs,
    lastPeriod.startDate,
    expectedNextPeriod,
    settings.lutealLength,
  );
  const fertileStartDate = addDays(ovDate, -5);
  const fertileEndDate = addDays(ovDate, 1);

  return {
    today,
    mode: settings.mode,
    phase: todayClass.phase,
    cycleDay: todayClass.cycleDay,
    daysUntilNextPeriod,
    daysLate,
    nextPeriodDate: expectedNextPeriod,
    ovulationDate: ovDate,
    fertileStartDate,
    fertileEndDate,
    isPeriodActiveToday,
    pregnancy: null,
  };
}

export function computePhaseSymptomInsights(
  logs: Record<string, DailyLog>,
  stats: CycleStats,
  settings: UserSettings,
  today: string,
): PhaseSymptomInsight[] {
  const buckets: Record<
    'menstrual' | 'follicular' | 'fertile' | 'luteal',
    { counts: Partial<Record<SymptomId, number>>; days: number }
  > = {
    menstrual: { counts: {}, days: 0 },
    follicular: { counts: {}, days: 0 },
    fertile: { counts: {}, days: 0 },
    luteal: { counts: {}, days: 0 },
  };

  for (const log of Object.values(logs)) {
    if (log.symptoms.length === 0) continue;
    const c = classifyDate(log.date, logs, stats, settings, today);
    let key: 'menstrual' | 'follicular' | 'fertile' | 'luteal';
    if (c.phase === 'menstrual' || c.phase === 'predicted_period') key = 'menstrual';
    else if (c.phase === 'fertile' || c.phase === 'ovulation') key = 'fertile';
    else if (c.phase === 'luteal') key = 'luteal';
    else key = 'follicular';

    buckets[key].days += 1;
    for (const s of log.symptoms) {
      buckets[key].counts[s] = (buckets[key].counts[s] ?? 0) + 1;
    }
  }

  return (['menstrual', 'follicular', 'fertile', 'luteal'] as const).map((phase) => {
    const entries = Object.entries(buckets[phase].counts)
      .map(([id, count]) => ({ id: id as SymptomId, count: count ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    return {
      phase,
      topSymptoms: entries,
      totalLoggedDays: buckets[phase].days,
    };
  });
}

export function formatTemp(bbtC: number, unit: 'C' | 'F'): string {
  if (unit === 'F') {
    return `${((bbtC * 9) / 5 + 32).toFixed(1)} °F`;
  }
  return `${bbtC.toFixed(2)} °C`;
}

export function toCelsius(value: number, unit: 'C' | 'F'): number {
  if (unit === 'F') {
    return Number((((value - 32) * 5) / 9).toFixed(2));
  }
  return Number(value.toFixed(2));
}

export interface BbtCoverlineResult {
  confirmed: boolean;
  coverlineC: number | null;
  shiftStartDate: string | null;
}

/**
 * Sympto-Thermal "3-over-6" rule:
 * Detects a sustained thermal shift where 3 consecutive BBT readings are all
 * above the highest of the previous 6 readings, with the 3rd reading >= +0.2 °C
 * above that baseline. Coverline is drawn 0.05 °C above the highest of the 6.
 */
export function computeBbtCoverline(
  points: Array<{ date: string; bbtC: number }>,
): BbtCoverlineResult {
  if (points.length < 9) {
    return { confirmed: false, coverlineC: null, shiftStartDate: null };
  }

  for (let i = 6; i <= points.length - 3; i++) {
    // Ensure the 6 baseline temps and 3 shift temps belong to the same cycle window
    // (avoid false coverlines across sparse readings separated by weeks/months)
    const baselineSpanDays = daysBetween(points[i - 6].date, points[i - 1].date);
    const gapToShiftDays = daysBetween(points[i - 1].date, points[i].date);
    const shiftSpanDays = daysBetween(points[i].date, points[i + 2].date);
    if (baselineSpanDays > 18 || gapToShiftDays > 4 || shiftSpanDays > 5) {
      continue;
    }

    const prev6Max = Math.max(...points.slice(i - 6, i).map((p) => p.bbtC));
    const t1 = points[i].bbtC;
    const t2 = points[i + 1].bbtC;
    const t3 = points[i + 2].bbtC;

    if (t1 > prev6Max && t2 > prev6Max && t3 >= Number((prev6Max + 0.2).toFixed(2))) {
      return {
        confirmed: true,
        coverlineC: Number((prev6Max + 0.05).toFixed(2)),
        shiftStartDate: points[i].date,
      };
    }
  }

  return { confirmed: false, coverlineC: null, shiftStartDate: null };
}

export interface PersonalSymptomForecast {
  windowLabel: string;
  symptoms: SymptomId[];
  matchedCycles: number;
  headline: string;
  body: string;
}

/**
 * Finds recurring personal symptom patterns across >= 2 past cycles and returns
 * a plain-English heads-up when today or tomorrow enters that window.
 */
export function computePersonalSymptomForecast(
  logs: Record<string, DailyLog>,
  stats: CycleStats,
  summary: TodaySummary,
): PersonalSymptomForecast | null {
  if (summary.mode === 'pregnancy' || stats.periods.length < 2) return null;

  // Check if user is in the 1..3 day pre-period window (today or tomorrow)
  const inPrePeriodWindow =
    !summary.isPeriodActiveToday &&
    summary.daysUntilNextPeriod !== null &&
    summary.daysUntilNextPeriod >= 1 &&
    summary.daysUntilNextPeriod <= 3;

  // Check if user is on Period Day 1..2
  const inEarlyPeriod =
    summary.isPeriodActiveToday && summary.cycleDay !== null && summary.cycleDay <= 2;

  if (!inPrePeriodWindow && !inEarlyPeriod) return null;

  const cycleHits: Partial<Record<SymptomId, number>> = {};

  for (const period of stats.periods) {
    const windowDates = inPrePeriodWindow
      ? [-3, -2, -1].map((d) => addDays(period.startDate, d))
      : [0, 1].map((d) => addDays(period.startDate, d));

    const seenInCycle = new Set<SymptomId>();
    for (const d of windowDates) {
      for (const s of logs[d]?.symptoms ?? []) {
        seenInCycle.add(s);
      }
    }
    for (const s of seenInCycle) {
      cycleHits[s] = (cycleHits[s] ?? 0) + 1;
    }
  }

  const recurring = Object.entries(cycleHits)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  if (recurring.length === 0) return null;

  const symptoms = recurring.map(([id]) => id as SymptomId);
  const maxMatched = recurring[0][1];
  const windowLabel = inPrePeriodWindow
    ? `${summary.daysUntilNextPeriod} ${summary.daysUntilNextPeriod === 1 ? 'day' : 'days'} before your period`
    : 'the first 2 days of your period';

  return {
    windowLabel,
    symptoms,
    matchedCycles: maxMatched,
    headline: inPrePeriodWindow
      ? `Personal heads-up (${summary.daysUntilNextPeriod}d before period)`
      : 'Personal early-period cue',
    body: `In ${maxMatched} past cycles, you often logged these around ${windowLabel}. Plan extra rest, hydration, and comfort ahead.`,
  };
}

export interface ClinicalHealthFlag {
  id: string;
  severity: 'info' | 'attention';
  title: string;
  detail: string;
}

/**
 * Gentle, non-diagnostic clinical pattern flags worth sharing with an OB-GYN.
 */
export function computeClinicalHealthFlags(
  logs: Record<string, DailyLog>,
  stats: CycleStats,
): ClinicalHealthFlag[] {
  const flags: ClinicalHealthFlag[] = [];
  const completed = stats.completedCycleLengths;

  const shortCycles = completed.filter((l) => l < 21).length;
  if (shortCycles >= 2) {
    flags.push({
      id: 'short-cycles',
      severity: 'attention',
      title: 'Recurring short cycles (< 21 days)',
      detail: `${shortCycles} logged cycles were shorter than 21 days. Worth reviewing with a clinician if persistent.`,
    });
  }

  const longCycles = completed.filter((l) => l > 35).length;
  if (longCycles >= 2) {
    flags.push({
      id: 'long-cycles',
      severity: 'attention',
      title: 'Recurring long cycles (> 35 days)',
      detail: `${longCycles} logged cycles exceeded 35 days — a pattern clinicians often check for hormonal or PCOS factors.`,
    });
  }

  if (stats.variationDays !== null && stats.variationDays > 9 && completed.length >= 3) {
    flags.push({
      id: 'high-variation',
      severity: 'info',
      title: `Cycle length variation (${stats.variationDays} days)`,
      detail: 'Cycle-to-cycle swings above 9 days are helpful to share at an annual gynecology check-up.',
    });
  }

  const prolongedPeriods = stats.periods.filter((p) => p.lengthDays > 8).length;
  if (prolongedPeriods >= 1) {
    flags.push({
      id: 'prolonged-bleeding',
      severity: 'attention',
      title: 'Prolonged bleeding (> 8 days)',
      detail: `${prolongedPeriods} logged ${prolongedPeriods === 1 ? 'period lasted' : 'periods lasted'} longer than 8 days. Consider sharing your PDF summary with a doctor.`,
    });
  }

  // Heavy menstrual bleeding: > 80 mL estimated in any period OR >= 3 heavy flow days in a period
  let heavyPeriodCount = 0;
  for (const period of stats.periods) {
    let ml = 0;
    let heavyDays = 0;
    for (let i = 0; i < period.lengthDays; i++) {
      const log = logs[addDays(period.startDate, i)];
      if (!log) continue;
      if (log.flow === 'heavy') heavyDays += 1;
      for (const h of log.hygieneChanges ?? []) {
        ml += h.estimatedMl;
      }
    }
    if (ml > 80 || heavyDays >= 3) {
      heavyPeriodCount += 1;
    }
  }
  if (heavyPeriodCount >= 1) {
    flags.push({
      id: 'heavy-flow',
      severity: 'attention',
      title: 'Heavy flow pattern noted',
      detail: `${heavyPeriodCount} ${heavyPeriodCount === 1 ? 'cycle showed' : 'cycles showed'} heavy bleeding (> 80 mL estimated or 3+ heavy days). Mention this to your doctor to check iron/ferritin levels.`,
    });
  }

  return flags;
}
