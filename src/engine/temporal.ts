/**
 * Location-agnostic calendar date utilities powered by Temporal.PlainDate
 * and Temporal.PlainYearMonth so travel across time zones or DST transitions
 * never shifts a period or ovulation date by +-1 day.
 *
 * Follows modern-web-guidance `capture-location-agnostic-data`:
 * dynamically loads `temporal-polyfill` only when native `Temporal` is absent.
 */

import type { Temporal as TemporalNS } from 'temporal-polyfill';

declare global {
  // eslint-disable-next-line no-var
  var Temporal: typeof TemporalNS | undefined;
}

let temporalReadyPromise: Promise<typeof TemporalNS> | null = null;

export async function ensureTemporal(): Promise<typeof TemporalNS> {
  if (typeof globalThis.Temporal !== 'undefined') {
    return globalThis.Temporal;
  }
  if (!temporalReadyPromise) {
    temporalReadyPromise = import('temporal-polyfill').then((mod) => {
      globalThis.Temporal = mod.Temporal;
      return mod.Temporal;
    });
  }
  return temporalReadyPromise;
}

function getTemporal(): typeof TemporalNS {
  if (typeof globalThis.Temporal === 'undefined') {
    throw new Error('Temporal not initialized. Call ensureTemporal() during app startup.');
  }
  return globalThis.Temporal;
}

export function todayPlainDate(): string {
  return getTemporal().Now.plainDateISO().toString();
}

export function parsePlainDate(iso: string): TemporalNS.PlainDate {
  return getTemporal().PlainDate.from(iso);
}

export function addDays(iso: string, days: number): string {
  return parsePlainDate(iso).add({ days }).toString();
}

export function daysBetween(startIso: string, endIso: string): number {
  const start = parsePlainDate(startIso);
  const end = parsePlainDate(endIso);
  return start.until(end, { largestUnit: 'day' }).days;
}

export function compareDates(a: string, b: string): number {
  return getTemporal().PlainDate.compare(parsePlainDate(a), parsePlainDate(b));
}

export function getYearMonth(iso: string): { year: number; month: number } {
  const d = parsePlainDate(iso);
  return { year: d.year, month: d.month };
}

export function shiftYearMonth(
  year: number,
  month: number,
  deltaMonths: number,
): { year: number; month: number } {
  const ym = getTemporal().PlainYearMonth.from({ year, month, calendar: 'iso8601' });
  const next = ym.add({ months: deltaMonths });
  return { year: next.year, month: next.month };
}

export function getMonthCalendarDays(year: number, month: number): {
  leadingEmpty: number;
  days: string[];
  monthLabel: string;
} {
  const T = getTemporal();
  const firstOfMonth = T.PlainDate.from({ year, month, day: 1 });
  const daysInMonth = firstOfMonth.daysInMonth;
  // Monday=1..Sunday=7 -> Sunday-first column offset (0..6)
  const leadingEmpty = firstOfMonth.dayOfWeek % 7;
  const days: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(T.PlainDate.from({ year, month, day }).toString());
  }
  const monthLabel = firstOfMonth.toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  return { leadingEmpty, days, monthLabel };
}

export function formatShortDate(iso: string): string {
  return parsePlainDate(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function formatLongDate(iso: string): string {
  return parsePlainDate(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatWeekdayShort(iso: string): string {
  return parsePlainDate(iso).toLocaleString(undefined, {
    weekday: 'narrow',
  });
}

export function getDayOfMonth(iso: string): number {
  return parsePlainDate(iso).day;
}
