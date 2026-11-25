import type {
  ActiveHygieneTimer,
  DailyLog,
  PillPackSettings,
  SanitaryProductType,
} from '../types';
import { addDays, daysBetween } from './temporal';

export const SANITARY_PRODUCTS: Array<{
  id: SanitaryProductType;
  label: string;
  defaultHours: number;
  maxSafeHours: number;
  estimatedMl: number;
}> = [
  { id: 'pad', label: 'Pad', defaultHours: 4, maxSafeHours: 6, estimatedMl: 5 },
  { id: 'tampon', label: 'Tampon', defaultHours: 4, maxSafeHours: 8, estimatedMl: 5 },
  { id: 'cup', label: 'Cup', defaultHours: 8, maxSafeHours: 12, estimatedMl: 15 },
  { id: 'disc', label: 'Disc', defaultHours: 12, maxSafeHours: 12, estimatedMl: 15 },
];

export function getProductMeta(product: SanitaryProductType) {
  return SANITARY_PRODUCTS.find((p) => p.id === product) ?? SANITARY_PRODUCTS[0];
}

export function createHygieneTimer(
  product: SanitaryProductType,
  durationHours?: number,
  now = new Date(),
): ActiveHygieneTimer {
  const meta = getProductMeta(product);
  const hours = durationHours ?? meta.defaultHours;
  const endsAt = new Date(now.getTime() + hours * 3600_000);
  return {
    product,
    startedAt: now.toISOString(),
    durationHours: hours,
    endsAt: endsAt.toISOString(),
  };
}

export function getHygieneTimerRemaining(
  timer: ActiveHygieneTimer,
  nowMs = Date.now(),
): {
  remainingMs: number;
  isDue: boolean;
  progressPercent: number;
  formatted: string;
} {
  const startMs = new Date(timer.startedAt).getTime();
  const endMs = new Date(timer.endsAt).getTime();
  const totalMs = Math.max(1, endMs - startMs);
  const remainingMs = endMs - nowMs;
  const isDue = remainingMs <= 0;
  const progressPercent = Math.max(0, Math.min(100, Math.round(((nowMs - startMs) / totalMs) * 100)));

  const absSeconds = Math.floor(Math.abs(remainingMs) / 1000);
  const h = Math.floor(absSeconds / 3600);
  const m = Math.floor((absSeconds % 3600) / 60);
  const s = absSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const formatted = isDue ? `Overdue by ${h}h ${pad(m)}m` : `${h}:${pad(m)}:${pad(s)}`;

  return { remainingMs, isDue, progressPercent, formatted };
}

export function computeTotalEstimatedMl(logs: Record<string, DailyLog>, dates: string[]): number {
  let total = 0;
  for (const d of dates) {
    const changes = logs[d]?.hygieneChanges;
    if (!changes) continue;
    for (const c of changes) {
      total += c.estimatedMl;
    }
  }
  return total;
}

/**
 * Computes current pill pack day (1..totalPills), active vs placebo/break status,
 * remaining supply for refill reminders, future start dates, and consecutive daily intake streak.
 */
export function computePillPackStatus(
  pillPack: PillPackSettings,
  today: string,
): {
  dayInPack: number;
  totalPills: number;
  pillsPerDay: number;
  startsInDays: number;
  isBreakDay: boolean;
  takenToday: boolean;
  streak: number;
  daysRemainingInPack: number;
  pillsRemaining: number;
  needsRefill: boolean;
  refillAlertDate: string | null;
  packDates: Array<{ date: string; dayNumber: number; isBreak: boolean; taken: boolean; isToday: boolean }>;
} {
  const totalPills = Math.max(1, Math.min(90, Math.round(pillPack.totalPills ?? 28)));
  const pillsPerDay = Math.max(1, Math.min(4, Math.round(pillPack.pillsPerDay ?? 1)));
  const start = pillPack.packStartDate ?? today;
  const rawDiff = daysBetween(start, today);
  const startsInDays = rawDiff < 0 ? Math.abs(rawDiff) : 0;

  const effectiveDiff = Math.max(0, rawDiff);
  const cycleIndex = Math.floor(effectiveDiff / totalPills);
  const currentPackStart = rawDiff < 0 ? start : addDays(start, cycleIndex * totalPills);
  const dayInPack = rawDiff < 0 ? 0 : (effectiveDiff % totalPills) + 1;

  const activeDays =
    pillPack.regimen === '21_7'
      ? Math.min(21, totalPills)
      : pillPack.regimen === '24_4'
        ? Math.min(24, totalPills)
        : totalPills;

  const takenSet = new Set(pillPack.takenDates);
  const isBreakDay = dayInPack > 0 && dayInPack > activeDays;
  const takenToday = takenSet.has(today);

  // Consecutive streak backwards from today (or yesterday if today not yet logged)
  let streak = 0;
  let cursor = takenToday ? today : addDays(today, -1);
  while (takenSet.has(cursor) && streak < 365) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  const packDates = Array.from({ length: totalPills }, (_, idx) => {
    const d = addDays(currentPackStart, idx);
    const dayNumber = idx + 1;
    return {
      date: d,
      dayNumber,
      isBreak: dayNumber > activeDays,
      taken: takenSet.has(d),
      isToday: d === today,
    };
  });

  const daysRemainingInPack =
    rawDiff < 0
      ? totalPills
      : Math.max(0, totalPills - dayInPack + (takenToday ? 0 : 1));

  const takenInCurrentPack = packDates.filter((d) => d.taken).length;
  const pillsRemaining = Math.max(0, (totalPills - takenInCurrentPack) * pillsPerDay);

  const refillEnabled = pillPack.refillReminderEnabled ?? true;
  const threshold = Math.max(1, Math.min(14, Math.round(pillPack.refillThresholdDays ?? 5)));
  const needsRefill =
    refillEnabled && startsInDays === 0 && (daysRemainingInPack <= threshold || pillsRemaining <= threshold * pillsPerDay);

  const refillDayOffset = Math.max(0, totalPills - threshold);
  const refillAlertDate = refillEnabled ? addDays(currentPackStart, refillDayOffset) : null;

  return {
    dayInPack,
    totalPills,
    pillsPerDay,
    startsInDays,
    isBreakDay,
    takenToday,
    streak,
    daysRemainingInPack,
    pillsRemaining,
    needsRefill,
    refillAlertDate,
    packDates,
  };
}
