import { beforeAll, describe, expect, it } from 'vitest';
import { computeCycleStats, computeTodaySummary } from '../cycleEngine';
import {
  buildPartnerInviteUrl,
  buildPartnerSnapshot,
  buildPartnerTextSummary,
  createDefaultPartnerShareConfig,
  decryptPartnerCarePing,
  decryptPartnerCareThread,
  decryptPartnerSnapshot,
  encryptPartnerCarePing,
  encryptPartnerCareThread,
  encryptPartnerSnapshot,
  formatPartnerPairingToken,
  generatePartnerCode,
  generateSyncKey,
  getPartnerCommunicationCues,
  getPartnerSupportTips,
  getSmartCarePingSuggestions,
  hashPartnerPin,
  parsePartnerPairingInput,
} from '../partnerSync';
import { generateQrMatrix } from '../qrCode';
import { ensureTemporal } from '../temporal';
import { createEmptyLog, createInitialData } from '../../types';

beforeAll(async () => {
  await ensureTemporal();
});

describe('partnerSync engine & 128-bit #hash E2EE', () => {
  it('generates unambiguous 6-char codes, 128-bit URL-safe syncKeys, and SHA-256 PIN hashes', async () => {
    const code = generatePartnerCode(6);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    const syncKey = generateSyncKey();
    expect(syncKey).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const h1 = await hashPartnerPin('2468');
    const h2 = await hashPartnerPin('2468');
    const h3 = await hashPartnerPin('1357');
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toHaveLength(64);
  });

  it('uses #partner=CODE.SYNCKEY hash fragments (never query strings) and parses pairing inputs cleanly', () => {
    const cfg = createDefaultPartnerShareConfig();
    expect(cfg.syncKey).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const url = buildPartnerInviteUrl(cfg.code, cfg.syncKey);
    expect(url).toContain(`#partner=${cfg.code}.${cfg.syncKey}`);
    expect(url).not.toContain('?partner=');

    // Parses full #hash invite URL preserving exact case of syncKey
    const parsedFromUrl = parsePartnerPairingInput(url);
    expect(parsedFromUrl).toEqual({ code: cfg.code, syncKey: cfg.syncKey });

    // Parses raw CODE.SYNCKEY pairing token even if code is lowercase
    const token = formatPartnerPairingToken(cfg.code.toLowerCase(), cfg.syncKey);
    expect(parsePartnerPairingInput(token)).toEqual({ code: cfg.code, syncKey: cfg.syncKey });

    // Backward-compatible with legacy 6-char codes
    expect(parsePartnerPairingInput('k7m9p2')).toEqual({ code: 'K7M9P2' });
    expect(parsePartnerPairingInput('invalid!')).toBeNull();

    // QR Version 5-L encodes full 77-char #partner=CODE.SYNCKEY URL cleanly
    const qr = generateQrMatrix(url);
    expect(qr.length).toBeGreaterThanOrEqual(33);
    expect(qr.length).toBe(qr[0].length);
  });

  it('strictly strips private notes, BBT, intimacy, and syncKey from snapshots', () => {
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

    const cfgAll = createDefaultPartnerShareConfig();
    cfgAll.profileLabel = 'Priya';
    const snapAll = buildPartnerSnapshot(cfgAll, data, stats, summary);
    const serialized = JSON.stringify(snapAll);

    expect(serialized).not.toContain('Super secret private note');
    expect(serialized).not.toContain('36.42');
    expect(serialized).not.toContain('sexLogged');
    expect(serialized).not.toContain(cfgAll.syncKey!);
    expect(snapAll.todaySymptoms).toEqual(['cramps', 'fatigue']);
    expect(snapAll.ovulationDate).toBe('2026-05-15');
    expect(snapAll.upcomingDays).toHaveLength(30);

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

    const tips = getPartnerSupportTips(snapAll);
    expect(tips.length).toBeGreaterThanOrEqual(2);
    const text = buildPartnerTextSummary(snapAll);
    expect(text).toContain('Priya');
    expect(text).toContain('Period active today');
  });

  it('end-to-end encrypts partner snapshots with 128-bit syncKey so code-only brute force fails even without PIN', async () => {
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

    // Encrypt with 128-bit syncKey and NO PIN
    const envelopeNoPin = await encryptPartnerSnapshot(snap, cfg.code, undefined, cfg.syncKey);
    const rawEnvelope = JSON.stringify(envelopeNoPin);
    expect(envelopeNoPin.e2ee).toBe(true);
    expect(rawEnvelope).not.toContain('Ananya');
    expect(rawEnvelope).not.toContain('cramps');
    expect(rawEnvelope).not.toContain(cfg.syncKey!);

    // Someone who only knows the 6-char code CANNOT decrypt without the 128-bit syncKey
    await expect(decryptPartnerSnapshot(envelopeNoPin, cfg.code, undefined, undefined)).rejects.toThrow();
    await expect(
      decryptPartnerSnapshot(envelopeNoPin, cfg.code, undefined, generateSyncKey()),
    ).rejects.toThrow();

    // Partner with exact syncKey decrypts cleanly
    const decryptedNoPin = await decryptPartnerSnapshot(envelopeNoPin, cfg.code, undefined, cfg.syncKey);
    expect(decryptedNoPin.profileLabel).toBe('Ananya');

    // Encrypt with BOTH syncKey AND 4-digit PIN
    const envelopeWithPin = await encryptPartnerSnapshot(snap, cfg.code, '4321', cfg.syncKey);
    const decryptedWithPin = await decryptPartnerSnapshot(envelopeWithPin, cfg.code, '4321', cfg.syncKey);
    expect(decryptedWithPin.todaySymptoms).toEqual(['cramps']);
    await expect(decryptPartnerSnapshot(envelopeWithPin, cfg.code, '9999', cfg.syncKey)).rejects.toThrow();
  });

  it('end-to-end encrypts two-way Partner Care Pings & CareThread with 128-bit syncKey', async () => {
    const syncKey = generateSyncKey();
    const ping = {
      id: 'care-123',
      message: 'Picking up warm tea and heating pad!',
      senderLabel: 'Your Partner',
      sentAt: '2026-06-01T10:00:00.000Z',
    };
    const env = await encryptPartnerCarePing(ping, 'KUB789', '2468', syncKey);
    expect(JSON.stringify(env)).not.toContain('heating pad');
    await expect(decryptPartnerCarePing(env, 'KUB789', '2468')).rejects.toThrow();
    const dec = await decryptPartnerCarePing(env, 'KUB789', '2468', syncKey);
    expect(dec.message).toBe(ping.message);

    const thread = {
      pings: [
        {
          id: 'req-1',
          direction: 'to_partner' as const,
          kind: 'request' as const,
          message: 'Could use warm tea / coffee',
          senderLabel: 'Priya',
          sentAt: '2026-06-01T10:05:00.000Z',
        },
        {
          id: 'care-1',
          direction: 'to_primary' as const,
          kind: 'hug' as const,
          message: 'Sending you a warm hug',
          senderLabel: 'Jeevan',
          sentAt: '2026-06-01T10:00:00.000Z',
          reaction: '❤️ Love this',
          seenAt: '2026-06-01T10:02:00.000Z',
        },
      ],
      updatedAt: '2026-06-01T10:05:00.000Z',
    };
    const threadEnv = await encryptPartnerCareThread(thread, 'KUB789', undefined, syncKey);
    const decThread = await decryptPartnerCareThread(threadEnv, 'KUB789', undefined, syncKey);
    expect(decThread.pings).toHaveLength(2);
    expect(decThread.pings[1].reaction).toBe('❤️ Love this');
  });

  it('strictly masks fertile/ovulation phases in phase & upcomingDays when shareFertileWindow is false', () => {
    const data = createInitialData();
    data.logs['2026-05-01'] = { ...createEmptyLog('2026-05-01'), flow: 'medium' };
    const stats = computeCycleStats(data.logs, data.settings);
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

    const cue = getPartnerCommunicationCues(snap);
    expect(cue.sayThis.length).toBeGreaterThan(10);
    const suggestions = getSmartCarePingSuggestions(snap);
    expect(suggestions).toHaveLength(4);
  });
});
