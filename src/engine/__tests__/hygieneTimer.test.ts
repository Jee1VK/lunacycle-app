import { beforeAll, describe, expect, it } from 'vitest';
import {
  computePillPackStatus,
  createHygieneTimer,
  getHygieneTimerRemaining,
} from '../hygieneTimer';
import { ensureTemporal } from '../temporal';
import { DEFAULT_SETTINGS } from '../../types';

beforeAll(async () => {
  await ensureTemporal();
});

describe('hygieneTimer & pillPack engine', () => {
  it('creates hygiene timer and computes remaining countdown and overdue state', () => {
    const start = new Date('2026-06-01T10:00:00Z');
    const timer = createHygieneTimer('cup', 8, start);
    expect(timer.durationHours).toBe(8);

    const mid = getHygieneTimerRemaining(timer, new Date('2026-06-01T14:00:00Z').getTime());
    expect(mid.isDue).toBe(false);
    expect(mid.progressPercent).toBe(50);
    expect(mid.formatted).toBe('4:00:00');

    const overdue = getHygieneTimerRemaining(timer, new Date('2026-06-01T19:30:00Z').getTime());
    expect(overdue.isDue).toBe(true);
    expect(overdue.progressPercent).toBe(100);
    expect(overdue.formatted).toContain('Overdue by 1h 30m');
  });

  it('tracks 21/7 pill pack active vs break days and consecutive streak', () => {
    const pack = {
      ...DEFAULT_SETTINGS.pillPack,
      enabled: true,
      regimen: '21_7' as const,
      packStartDate: '2026-06-01',
      takenDates: ['2026-06-20', '2026-06-21', '2026-06-22'],
    };

    const status = computePillPackStatus(pack, '2026-06-22');
    expect(status.dayInPack).toBe(22);
    expect(status.isBreakDay).toBe(true);
    expect(status.takenToday).toBe(true);
    expect(status.streak).toBe(3);
    expect(status.packDates).toHaveLength(28);
  });
});
