import { beforeAll, describe, expect, it } from 'vitest';
import { sanitizeLunaData } from '../cryptoStorage';
import {
  classifyDate,
  computeCycleStats,
  computeTodaySummary,
  hasNonFlowLogDetails,
} from '../cycleEngine';
import { getUiStrings, LANGUAGE_OPTIONS } from '../i18n';
import { computeActiveReminders } from '../reminders';
import { ensureTemporal } from '../temporal';
import { createEmptyLog, createInitialData, DEFAULT_SETTINGS, type DailyLog } from '../../types';

beforeAll(async () => {
  await ensureTemporal();
});

describe('Multi-language completeness (EN, KN, HI, TA, TE)', () => {
  it('provides non-empty localized strings for all 5 languages', () => {
    expect(LANGUAGE_OPTIONS.map((l) => l.id)).toEqual(['en', 'kn', 'hi', 'ta', 'te']);
    for (const lang of LANGUAGE_OPTIONS) {
      const strings = getUiStrings(lang.id);
      for (const [key, val] of Object.entries(strings)) {
        expect(val.trim().length, `Missing ${lang.id}.${key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('Audit regression tests', () => {
  it('retains logs containing only customSymptoms, customMoods, or hygieneChanges', () => {
    expect(
      hasNonFlowLogDetails({ ...createEmptyLog('2026-06-01'), customSymptoms: ['Migraine aura'] }),
    ).toBe(true);
    expect(
      hasNonFlowLogDetails({ ...createEmptyLog('2026-06-01'), customMoods: ['Focused'] }),
    ).toBe(true);
    expect(
      hasNonFlowLogDetails({
        ...createEmptyLog('2026-06-01'),
        hygieneChanges: [{ product: 'cup', changedAt: '2026-06-01T10:00:00Z', estimatedMl: 15 }],
      }),
    ).toBe(true);
    expect(hasNonFlowLogDetails(createEmptyLog('2026-06-01'))).toBe(false);
  });

  it('suppresses fertile and ovulation phases in both past and future cycles for Birth Control & Simple Modes', () => {
    const logs: Record<string, DailyLog> = {
      '2026-01-01': { ...createEmptyLog('2026-01-01'), flow: 'medium' },
      '2026-01-29': { ...createEmptyLog('2026-01-29'), flow: 'medium' },
    };

    for (const flag of ['birthControlMode', 'simpleMode'] as const) {
      const settings = { ...DEFAULT_SETTINGS, [flag]: true };
      const stats = computeCycleStats(logs, settings);

      // Past cycle ovulation day (Jan 15) must NOT be marked fertile/ovulation
      const pastOv = classifyDate('2026-01-15', logs, stats, settings, '2026-02-01');
      expect(pastOv.isOvulation).toBe(false);
      expect(pastOv.isFertile).toBe(false);

      // Current/future cycle ovulation day (Feb 12) must NOT be marked fertile/ovulation
      const futureOv = classifyDate('2026-02-12', logs, stats, settings, '2026-02-01');
      expect(futureOv.isOvulation).toBe(false);
      expect(futureOv.isFertile).toBe(false);
    }
  });

  it('triggers PMS window alert 4 days before predicted period and hides fertile alerts in BC mode', () => {
    const data = createInitialData();
    data.settings.birthControlMode = true;
    data.logs['2026-03-01'] = { ...createEmptyLog('2026-03-01'), flow: 'heavy' };

    const stats = computeCycleStats(data.logs, data.settings);
    const summary = computeTodaySummary('2026-03-25', data.logs, stats, data.settings); // 4 days before Mar 29
    const alerts = computeActiveReminders(data, summary);
    expect(alerts.some((a) => a.id === 'pms-window')).toBe(true);
    expect(alerts.some((a) => a.id.startsWith('fertile') || a.id === 'ovulation-peak')).toBe(false);
  });

  it('preserves all Tier 1 and Tier 2 settings through sanitizeLunaData', () => {
    const raw = createInitialData();
    raw.settings.language = 'ta';
    raw.settings.theme = 'dark';
    raw.settings.simpleMode = true;
    raw.settings.birthControlMode = true;
    raw.settings.customSymptoms = ['Iron pill'];
    raw.settings.pillPack.enabled = true;
    raw.settings.pillPack.takenDates = ['2026-05-01'];

    const sanitized = sanitizeLunaData(raw);
    expect(sanitized.settings.language).toBe('ta');
    expect(sanitized.settings.theme).toBe('dark');
    expect(sanitized.settings.simpleMode).toBe(true);
    expect(sanitized.settings.birthControlMode).toBe(true);
    expect(sanitized.settings.customSymptoms).toEqual(['Iron pill']);
    expect(sanitized.settings.pillPack.takenDates).toEqual(['2026-05-01']);

    // Verify new burgundy & maroon themes persist cleanly
    raw.settings.theme = 'burgundy';
    expect(sanitizeLunaData(raw).settings.theme).toBe('burgundy');
    raw.settings.theme = 'maroon';
    expect(sanitizeLunaData(raw).settings.theme).toBe('maroon');
  });
});
