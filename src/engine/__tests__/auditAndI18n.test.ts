import { beforeAll, describe, expect, it } from 'vitest';
import { PHASE_INFO } from '../catalog';
import { sanitizeLunaData } from '../cryptoStorage';
import {
  classifyDate,
  computeCycleStats,
  computePregnancySummary,
  computeTodaySummary,
  hasNonFlowLogDetails,
} from '../cycleEngine';
import { getUiStrings, LANGUAGE_OPTIONS } from '../i18n';
import {
  MEDICAL_CITATIONS,
  PHYSICIAN_CONSULTATION_NOTICE,
  WELLNESS_MEDICAL_DISCLAIMER,
} from '../medicalSources';
import { getSafeNotificationText } from '../nativeNotifications';
import { CYCLE_ARTICLES } from '../partnerLibrary';
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

describe('Regulatory, Privacy & Clinical Compliance (Apple 1.4.1, PCPNDT, Lock-Screen)', () => {
  it('provides peer-reviewed clinical citations (ACOG, WHO, NIH, Mayo Clinic) and non-contraceptive disclaimers', () => {
    expect(MEDICAL_CITATIONS.length).toBeGreaterThanOrEqual(6);
    const orgs = MEDICAL_CITATIONS.map((c) => c.organization).join(' ');
    expect(orgs).toContain('ACOG');
    expect(orgs).toContain('WHO');
    expect(orgs).toContain('NIH');
    expect(orgs).toContain('Mayo Clinic');
    for (const cite of MEDICAL_CITATIONS) {
      expect(cite.url).toMatch(/^https:\/\//);
    }
    expect(WELLNESS_MEDICAL_DISCLAIMER).toMatch(/NOT a contraceptive/i);
    expect(PHYSICIAN_CONSULTATION_NOTICE).toMatch(/OB-GYN|physician/i);
  });

  it('contains zero fetal sex/gender prediction content across Pregnancy milestones and articles (PCPNDT Act 1994)', () => {
    const bannedGenderRegex = /\b(boy or girl|baby gender|fetal sex|gender predictor|sex selection|chinese gender)\b/i;
    for (let weeks = 1; weeks <= 41; weeks++) {
      const preg = computePregnancySummary('2026-10-01', {
        ...DEFAULT_SETTINGS,
        mode: 'pregnancy',
        pregnancyLmpDate: '2026-01-01',
        pregnancyDueDate: '2026-10-08',
      });
      expect(preg?.milestone ?? '').not.toMatch(bannedGenderRegex);
    }
    expect(JSON.stringify(CYCLE_ARTICLES)).not.toMatch(bannedGenderRegex);
    expect(JSON.stringify(PHASE_INFO)).not.toMatch(bannedGenderRegex);
  });

  it('redacts lock-screen notification details by default unless showLockScreenDetails is explicitly enabled', () => {
    expect(DEFAULT_SETTINGS.reminders.showLockScreenDetails).toBe(false);

    // Default (showLockScreenDetails = false, disguiseMode = false) -> generic text, no "Period" or "Pill"
    const defaultPeriod = getSafeNotificationText(
      false,
      false,
      '',
      'LunaCycle Reminder',
      'Period expected in 2 days.',
    );
    expect(defaultPeriod.body).not.toMatch(/period|ovulation|fertile|pill/i);

    const defaultPill = getSafeNotificationText(
      false,
      false,
      '',
      'Daily Pill Reminder',
      'Time for your daily pill pack reminder (1 pill).',
      'pill',
    );
    expect(defaultPill.body).not.toMatch(/period|ovulation|fertile|pill/i);

    // Opt-in showLockScreenDetails = true (and disguiseMode = false) -> shows detailed reminder
    const detailed = getSafeNotificationText(
      false,
      true,
      '',
      'LunaCycle Reminder',
      'Period expected in 2 days.',
    );
    expect(detailed.body).toBe('Period expected in 2 days.');

    // Disguise Mode overrides even if showLockScreenDetails is true
    const disguised = getSafeNotificationText(
      true,
      true,
      '',
      'LunaCycle Reminder',
      'Period expected in 2 days.',
    );
    expect(disguised.title).toBe('Daily Notes');
    expect(disguised.body).not.toMatch(/period/i);
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

  it('suppresses fertile and ovulation phases in both past and future cycles for Pause Fertility & Simple Modes', () => {
    const logs: Record<string, DailyLog> = {
      '2026-01-01': { ...createEmptyLog('2026-01-01'), flow: 'medium' },
      '2026-01-29': { ...createEmptyLog('2026-01-29'), flow: 'medium' },
    };

    for (const flag of ['birthControlMode', 'simpleMode'] as const) {
      const settings = { ...DEFAULT_SETTINGS, [flag]: true };
      const stats = computeCycleStats(logs, settings);

      const pastOv = classifyDate('2026-01-15', logs, stats, settings, '2026-02-01');
      expect(pastOv.isOvulation).toBe(false);
      expect(pastOv.isFertile).toBe(false);

      const futureOv = classifyDate('2026-02-12', logs, stats, settings, '2026-02-01');
      expect(futureOv.isOvulation).toBe(false);
      expect(futureOv.isFertile).toBe(false);
    }
  });

  it('triggers PMS window alert 4 days before predicted period and hides fertile alerts when fertility estimates paused', () => {
    const data = createInitialData();
    data.settings.birthControlMode = true;
    data.logs['2026-03-01'] = { ...createEmptyLog('2026-03-01'), flow: 'heavy' };

    const stats = computeCycleStats(data.logs, data.settings);
    const summary = computeTodaySummary('2026-03-25', data.logs, stats, data.settings);
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
    raw.settings.reminders.showLockScreenDetails = true;

    const sanitized = sanitizeLunaData(raw);
    expect(sanitized.settings.language).toBe('ta');
    expect(sanitized.settings.theme).toBe('dark');
    expect(sanitized.settings.simpleMode).toBe(true);
    expect(sanitized.settings.birthControlMode).toBe(true);
    expect(sanitized.settings.customSymptoms).toEqual(['Iron pill']);
    expect(sanitized.settings.pillPack.takenDates).toEqual(['2026-05-01']);
    expect(sanitized.settings.reminders.showLockScreenDetails).toBe(true);
  });
});
