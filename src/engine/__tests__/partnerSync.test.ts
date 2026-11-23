import { beforeAll, describe, expect, it } from 'vitest';
import { computeCycleStats, computeTodaySummary } from '../cycleEngine';
import {
  buildPartnerSnapshot,
  buildPartnerTextSummary,
  createDefaultPartnerShareConfig,
  generatePartnerCode,
  getPartnerSupportTips,
  hashPartnerPin,
} from '../partnerSync';
import { ensureTemporal } from '../temporal';
import { createEmptyLog, createInitialData } from '../../types';

beforeAll(async () => {
  await ensureTemporal();
});

describe('partnerSync engine', () => {
  it('generates unambiguous 6-character codes and deterministic SHA-256 PIN hashes', async () => {
    const code = generatePartnerCode(6);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    const h1 = await hashPartnerPin('2468');
    const h2 = await hashPartnerPin('2468');
    const h3 = await hashPartnerPin('1357');
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toHaveLength(64);
  });

  it('strictly strips private notes, BBT, intimacy, and respects granular partner permissions', () => {
    const data = createInitialData();
    data.logs['2026-05-01'] = {
      ...createEmptyLog('2026-05-01'),
      flow: 'heavy',
      symptoms: ['cramps', 'fatigue'],
      moods: ['sensitive'],
      bbtC: 36.42,
      sexLogged: true,
      notes: 'Super secret private note that must NEVER leave device',
    };

    const stats = computeCycleStats(data.logs, data.settings);
    const summary = computeTodaySummary('2026-05-01', data.logs, stats, data.settings);

    // 1. With all partner permissions enabled
    const cfgAll = createDefaultPartnerShareConfig();
    cfgAll.profileLabel = 'Priya';
    const snapAll = buildPartnerSnapshot(cfgAll, data, stats, summary);
    const serialized = JSON.stringify(snapAll);

    expect(serialized).not.toContain('Super secret private note');
    expect(serialized).not.toContain('36.42');
    expect(serialized).not.toContain('sexLogged');
    expect(snapAll.todaySymptoms).toEqual(['cramps', 'fatigue']);
    expect(snapAll.ovulationDate).toBe('2026-05-15');
    expect(snapAll.upcomingDays).toHaveLength(14);

    // 2. With selective permissions disabled
    const cfgMinimal = {
      ...cfgAll,
      permissions: {
        shareFertileWindow: false,
        shareSymptomsAndMood: false,
        shareUpcomingForecast: false,
      },
    };
    const snapMin = buildPartnerSnapshot(cfgMinimal, data, stats, summary);
    expect(snapMin.ovulationDate).toBeNull();
    expect(snapMin.todaySymptoms).toBeUndefined();
    expect(snapMin.upcomingDays).toBeUndefined();

    // 3. Support tips & shareable text respect snapshot
    const tips = getPartnerSupportTips(snapAll);
    expect(tips.length).toBeGreaterThanOrEqual(2);
    const text = buildPartnerTextSummary(snapAll);
    expect(text).toContain('Priya');
    expect(text).toContain('Period active today');
  });
});
