import { beforeAll, describe, expect, it } from 'vitest';
import {
  classifyDate,
  computeClinicalHealthFlags,
  computeCycleStats,
  computePersonalSymptomForecast,
  computePregnancySummary,
  computeTodaySummary,
  extractPeriods,
} from '../cycleEngine';
import { addDays, ensureTemporal } from '../temporal';
import { createEmptyLog, DEFAULT_SETTINGS, type DailyLog, type UserSettings } from '../../types';

beforeAll(async () => {
  await ensureTemporal();
});

function logFlow(date: string, flow: DailyLog['flow']): DailyLog {
  return { ...createEmptyLog(date), flow };
}

describe('extractPeriods', () => {
  it('merges consecutive bleeding days and ignores 1-day mid-period pause', () => {
    const logs: Record<string, DailyLog> = {
      '2026-01-01': logFlow('2026-01-01', 'medium'),
      '2026-01-02': logFlow('2026-01-02', 'heavy'),
      // 1-day pause on Jan 3
      '2026-01-04': logFlow('2026-01-04', 'light'),
      // adjacent spotting extends end date
      '2026-01-05': logFlow('2026-01-05', 'spotting'),
      // isolated mid-cycle spotting does NOT trigger a false new period
      '2026-01-15': logFlow('2026-01-15', 'spotting'),
      // next period
      '2026-01-29': logFlow('2026-01-29', 'medium'),
      '2026-01-30': logFlow('2026-01-30', 'heavy'),
    };

    const periods = extractPeriods(logs);
    expect(periods).toHaveLength(2);
    expect(periods[0]).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-01-05',
      lengthDays: 5,
      cycleLengthToNext: 28,
    });
    expect(periods[1]).toEqual({
      startDate: '2026-01-29',
      endDate: '2026-01-30',
      lengthDays: 2,
      cycleLengthToNext: null,
    });
  });
});

describe('computeCycleStats & predictions', () => {
  it('calculates weighted average cycle length and excludes extreme outliers from skewing predictions', () => {
    const logs: Record<string, DailyLog> = {
      '2025-09-01': logFlow('2025-09-01', 'medium'),
      '2025-11-25': logFlow('2025-11-25', 'medium'), // 85-day outlier (excluded from avg)
      '2025-12-25': logFlow('2025-12-25', 'medium'), // 30-day cycle
      '2026-01-24': logFlow('2026-01-24', 'medium'), // 30-day cycle
    };

    const stats = computeCycleStats(logs, DEFAULT_SETTINGS);
    expect(stats.averageCycleLength).toBe(30);
    expect(stats.completedCycleLengths).toEqual([85, 30, 30]);
    expect(stats.regularity).toBe('irregular');
  });

  it('predicts ovulation, fertile window, and next period across leap-year February accurately', () => {
    const logs: Record<string, DailyLog> = {
      '2024-02-01': logFlow('2024-02-01', 'medium'),
      '2024-02-02': logFlow('2024-02-02', 'heavy'),
      '2024-02-03': logFlow('2024-02-03', 'light'),
    };
    const settings: UserSettings = {
      ...DEFAULT_SETTINGS,
      defaultCycleLength: 28,
      defaultPeriodLength: 4,
      lutealLength: 14,
    };

    const stats = computeCycleStats(logs, settings);
    // 2024 is a leap year: Feb 1 + 28 days = Feb 29 (NOT Mar 1!)
    const summary = computeTodaySummary('2024-02-15', logs, stats, settings);
    expect(summary.nextPeriodDate).toBe('2024-02-29');
    expect(summary.ovulationDate).toBe('2024-02-15');
    expect(summary.phase).toBe('ovulation');
    expect(summary.daysUntilNextPeriod).toBe(14);
  });

  it('refines ovulation date when a Peak LH test is logged in the current cycle', () => {
    const logs: Record<string, DailyLog> = {
      '2026-03-01': logFlow('2026-03-01', 'medium'),
      '2026-03-11': { ...createEmptyLog('2026-03-11'), lhTest: 'peak' },
    };
    const stats = computeCycleStats(logs, DEFAULT_SETTINGS);
    const summary = computeTodaySummary('2026-03-12', logs, stats, DEFAULT_SETTINGS);
    expect(summary.ovulationDate).toBe('2026-03-12');
    expect(summary.phase).toBe('ovulation');
  });

  it('detects late period cleanly without shifting past dates', () => {
    const logs: Record<string, DailyLog> = {
      '2026-04-01': logFlow('2026-04-01', 'heavy'),
    };
    const stats = computeCycleStats(logs, DEFAULT_SETTINGS);
    const today = addDays('2026-04-01', 31); // 3 days past 28d cycle
    const summary = computeTodaySummary(today, logs, stats, DEFAULT_SETTINGS);
    expect(summary.daysLate).toBe(3);

    const dayClass = classifyDate(today, logs, stats, DEFAULT_SETTINGS, today);
    expect(dayClass.isLatePeriod).toBe(true);
    expect(dayClass.daysLate).toBe(3);
  });
});

describe('computePregnancySummary', () => {
  it('computes gestational weeks, days, trimester, and remaining days from LMP', () => {
    const settings: UserSettings = {
      ...DEFAULT_SETTINGS,
      mode: 'pregnancy',
      pregnancyLmpDate: '2026-01-01',
      pregnancyDueDate: null,
    };

    const today = addDays('2026-01-01', 100); // 14w 2d -> Trimester 2
    const preg = computePregnancySummary(today, settings);
    expect(preg).not.toBeNull();
    expect(preg?.weeks).toBe(14);
    expect(preg?.days).toBe(2);
    expect(preg?.trimester).toBe(2);
    expect(preg?.daysRemaining).toBe(180);
  });

  it('computes personal predictive symptom heads-ups and clinical health flags', () => {
    const logs: Record<string, DailyLog> = {};
    // 3 long cycles (38 days apart) with recurring cramps 2 days before period + heavy flow
    const starts = ['2026-01-01', '2026-02-08', '2026-03-18'];
    for (const s of starts) {
      for (let d = 0; d < 9; d++) {
        const iso = addDays(s, d);
        logs[iso] = {
          ...createEmptyLog(iso),
          flow: d < 4 ? 'heavy' : 'light',
        };
      }
      const pre = addDays(s, -2);
      logs[pre] = {
        ...createEmptyLog(pre),
        symptoms: ['cramps', 'fatigue'],
      };
    }

    const stats = computeCycleStats(logs, DEFAULT_SETTINGS);
    const flags = computeClinicalHealthFlags(logs, stats);
    expect(flags.some((f) => f.id === 'long-cycles')).toBe(true);
    expect(flags.some((f) => f.id === 'prolonged-bleeding')).toBe(true);
    expect(flags.some((f) => f.id === 'heavy-flow')).toBe(true);

    // 2 days before next predicted period (2026-03-18 + 38 = 2026-04-25 -> 2026-04-23)
    const today = '2026-04-23';
    const summary = computeTodaySummary(today, logs, stats, DEFAULT_SETTINGS);
    const forecast = computePersonalSymptomForecast(logs, stats, summary);
    expect(forecast).not.toBeNull();
    expect(forecast?.symptoms).toContain('cramps');
  });
});
