import { beforeAll, describe, expect, it } from 'vitest';
import { computeCycleStats, computeTodaySummary } from '../cycleEngine';
import {
  buildPartnerSnapshot,
  buildPartnerTextSummary,
  createDefaultPartnerShareConfig,
  decryptPartnerCarePing,
  decryptPartnerSnapshot,
  encryptPartnerCarePing,
  encryptPartnerSnapshot,
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

  it('end-to-end encrypts partner snapshots with AES-256-GCM so relay sees zero plaintext', async () => {
    const data = createInitialData();
    data.logs['2026-05-01'] = {
      ...createEmptyLog('2026-05-01'),
      flow: 'heavy',
      symptoms: ['cramps'],
    };
    const stats = computeCycleStats(data.logs, data.settings);
    const summary = computeTodaySummary('2026-05-01', data.logs, stats, data.settings);
    const cfg = createDefaultPartnerShareConfig();
    cfg.profileLabel = 'Ananya';

    const snap = buildPartnerSnapshot(cfg, data, stats, summary);
    const envelope = await encryptPartnerSnapshot(snap, cfg.code, '4321');
    const rawEnvelope = JSON.stringify(envelope);

    expect(envelope.e2ee).toBe(true);
    expect(rawEnvelope).not.toContain('Ananya');
    expect(rawEnvelope).not.toContain('cramps');
    expect(rawEnvelope).not.toContain('menstrual');

    const decrypted = await decryptPartnerSnapshot(envelope, cfg.code, '4321');
    expect(decrypted.profileLabel).toBe('Ananya');
    expect(decrypted.todaySymptoms).toEqual(['cramps']);

    await expect(decryptPartnerSnapshot(envelope, cfg.code, '9999')).rejects.toThrow();
  });

  it('end-to-end encrypts two-way Partner Care Pings with AES-256-GCM', async () => {
    const ping = {
      id: 'care-123',
      message: 'Picking up warm tea and heating pad!',
      senderLabel: 'Your Partner',
      sentAt: '2026-06-01T10:00:00.000Z',
    };
    const env = await encryptPartnerCarePing(ping, 'KUB789', '2468');
    expect(JSON.stringify(env)).not.toContain('heating pad');
    const dec = await decryptPartnerCarePing(env, 'KUB789', '2468');
    expect(dec.message).toBe(ping.message);
    await expect(decryptPartnerCarePing(env, 'KUB789', '0000')).rejects.toThrow();
  });

  it('strictly masks fertile/ovulation phases in phase & upcomingDays when shareFertileWindow is false', () => {
    const data = createInitialData();
    data.logs['2026-05-01'] = { ...createEmptyLog('2026-05-01'), flow: 'medium' };
    const stats = computeCycleStats(data.logs, data.settings);
    // 2026-05-15 is estimated ovulation day for a 28-day cycle starting May 1
    const summary = computeTodaySummary('2026-05-15', data.logs, stats, data.settings);
    expect(summary.phase).toBe('ovulation');

    const cfg = createDefaultPartnerShareConfig();
    cfg.permissions.shareFertileWindow = false;
    cfg.permissions.shareUpcomingForecast = true;
    cfg.todayNeedStatus = "I'd love a hug";
    cfg.comfortPreferences = ['Warm tea / chai', 'Heating pad'];

    const snap = buildPartnerSnapshot(cfg, data, stats, summary);
    expect(snap.phase).toBe('follicular');
    expect(snap.ovulationDate).toBeNull();
    expect(snap.upcomingDays?.some((d) => d.phase === 'fertile' || d.phase === 'ovulation')).toBe(false);
    expect(snap.todayNeedStatus).toBe("I'd love a hug");
    expect(snap.comfortPreferences).toEqual(['Warm tea / chai', 'Heating pad']);
  });
});
