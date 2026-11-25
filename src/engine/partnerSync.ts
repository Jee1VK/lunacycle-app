import type {
  CycleStats,
  LunaData,
  PartnerCarePing,
  PartnerCareThread,
  PartnerShareConfig,
  PartnerSnapshot,
  PartnerWatchConfig,
  TodaySummary,
} from '../types';
import { PHASE_INFO, SYMPTOM_LABEL_MAP } from './catalog';
import { classifyDate } from './cycleEngine';
import { computePillPackStatus } from './hygieneTimer';
import { addDays, formatShortDate } from './temporal';

export const DEFAULT_PARTNER_SYNC_URL: string =
  import.meta.env.VITE_PARTNER_SYNC_URL ||
  'https://lunacycle-partner-sync.medclock-sync.workers.dev';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generatePartnerCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return out;
}

export function generateWriteSecret(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPartnerPin(pin: string): Promise<string> {
  const trimmed = pin.trim();
  if (!trimmed) return '';
  const data = new TextEncoder().encode(`lunacycle-partner-pin:${trimmed}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const E2EE_ITERATIONS = 120_000;

export interface PartnerE2eeEnvelope {
  e2ee: true;
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  saltBase64: string;
  ivBase64: string;
  ciphertextBase64: string;
  updatedAt: string;
  pinHash?: string;
  writeSecret?: string;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function derivePartnerKey(
  code: string,
  pin: string | undefined,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const secret = `lunacycle-e2ee:${code.trim().toUpperCase()}:${(pin ?? '').trim()}`;
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: E2EE_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptPartnerSnapshot(
  snapshot: PartnerSnapshot,
  code: string,
  pin?: string,
): Promise<PartnerE2eeEnvelope> {
  const salt = new Uint8Array(new ArrayBuffer(16));
  const iv = new Uint8Array(new ArrayBuffer(12));
  crypto.getRandomValues(salt);
  crypto.getRandomValues(iv);

  const { writeSecret, pinHash, ...sensitive } = snapshot;
  const key = await derivePartnerKey(code, pin, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(sensitive));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return {
    e2ee: true,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: E2EE_ITERATIONS,
    saltBase64: toBase64(salt),
    ivBase64: toBase64(iv),
    ciphertextBase64: toBase64(new Uint8Array(ciphertext)),
    updatedAt: snapshot.updatedAt,
    pinHash,
    writeSecret,
  };
}

export async function decryptPartnerSnapshot(
  envelope: PartnerE2eeEnvelope,
  code: string,
  pin?: string,
): Promise<PartnerSnapshot> {
  const salt = fromBase64(envelope.saltBase64);
  const iv = fromBase64(envelope.ivBase64);
  const ciphertext = fromBase64(envelope.ciphertextBase64);
  const key = await derivePartnerKey(code, pin, salt);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as PartnerSnapshot;
}

function isPartnerE2eeEnvelope(val: unknown): val is PartnerE2eeEnvelope {
  if (!val || typeof val !== 'object') return false;
  const obj = val as Record<string, unknown>;
  return (
    obj.e2ee === true &&
    obj.algorithm === 'AES-GCM' &&
    typeof obj.saltBase64 === 'string' &&
    typeof obj.ivBase64 === 'string' &&
    typeof obj.ciphertextBase64 === 'string'
  );
}

export function createDefaultPartnerShareConfig(): PartnerShareConfig {
  return {
    enabled: false,
    code: generatePartnerCode(6),
    writeSecret: generateWriteSecret(),
    profileLabel: 'My Cycle',
    syncServerUrl: DEFAULT_PARTNER_SYNC_URL,
    permissions: {
      shareFertileWindow: true,
      shareSymptomsAndMood: true,
      shareUpcomingForecast: true,
      sharePillRefillStatus: false,
    },
    todayNeedStatus: '',
    comfortPreferences: ['Warm tea / chai', 'Heating pad', 'Quiet evening'],
  };
}

/**
 * Builds a strictly privacy-scoped snapshot for the connected partner.
 * NEVER includes private journal notes, BBT decimals, LH strip results, or intimacy logs.
 * Strictly masks fertile/ovulation phases when shareFertileWindow is disabled.
 */
export function buildPartnerSnapshot(
  config: PartnerShareConfig,
  data: LunaData,
  stats: CycleStats,
  summary: TodaySummary,
  now = new Date(),
): PartnerSnapshot {
  const todayLog = data.logs[summary.today];
  const { permissions } = config;
  const maskFertilePhase = (phase: PartnerSnapshot['phase']): PartnerSnapshot['phase'] => {
    if (!permissions.shareFertileWindow && (phase === 'fertile' || phase === 'ovulation')) {
      return 'follicular';
    }
    return phase;
  };

  const upcomingDays = permissions.shareUpcomingForecast
    ? Array.from({ length: 30 }, (_, idx) => {
        const d = addDays(summary.today, idx);
        const c = classifyDate(d, data.logs, stats, data.settings, summary.today);
        return { date: d, phase: maskFertilePhase(c.phase) };
      })
    : undefined;

  let pillRefillNeeded: boolean | undefined;
  let pillDaysRemaining: number | undefined;
  if (permissions.sharePillRefillStatus && data.settings.pillPack.enabled && !data.settings.simpleMode) {
    const latestPeriodStart =
      stats.periods.length > 0 ? stats.periods[stats.periods.length - 1].startDate : null;
    const pillStatus = computePillPackStatus(data.settings.pillPack, summary.today, latestPeriodStart);
    pillRefillNeeded = pillStatus.needsRefill;
    pillDaysRemaining = pillStatus.daysRemainingInPack;
  }

  return {
    version: 1,
    code: config.code.toUpperCase(),
    profileLabel: config.profileLabel.trim() || 'My Cycle',
    updatedAt: now.toISOString(),
    asOfDate: summary.today,
    mode: summary.mode,
    phase: maskFertilePhase(summary.phase),
    cycleDay: summary.cycleDay,
    averageCycleLength: stats.averageCycleLength,
    daysUntilNextPeriod: summary.daysUntilNextPeriod,
    daysLate: summary.daysLate,
    nextPeriodDate: summary.nextPeriodDate,
    isPeriodActiveToday: summary.isPeriodActiveToday,
    todayFlow: summary.isPeriodActiveToday ? todayLog?.flow : undefined,
    ovulationDate: permissions.shareFertileWindow ? summary.ovulationDate : null,
    fertileStartDate: permissions.shareFertileWindow ? summary.fertileStartDate : null,
    fertileEndDate: permissions.shareFertileWindow ? summary.fertileEndDate : null,
    todaySymptoms: permissions.shareSymptomsAndMood ? (todayLog?.symptoms ?? []) : undefined,
    todayCustomSymptoms: permissions.shareSymptomsAndMood ? (todayLog?.customSymptoms ?? []) : undefined,
    todayMoods: permissions.shareSymptomsAndMood ? (todayLog?.moods ?? []) : undefined,
    todayNeedStatus: config.todayNeedStatus?.trim() || undefined,
    comfortPreferences:
      config.comfortPreferences && config.comfortPreferences.length > 0
        ? config.comfortPreferences
        : undefined,
    pillRefillNeeded,
    pillDaysRemaining,
    pregnancy: summary.pregnancy,
    upcomingDays,
    pinHash: config.pinHash,
    writeSecret: config.writeSecret,
  };
}

export function buildPartnerTextSummary(snapshot: PartnerSnapshot): string {
  if (snapshot.mode === 'pregnancy' && snapshot.pregnancy) {
    return `LunaCycle Update (${snapshot.profileLabel}): Week ${snapshot.pregnancy.weeks}d${snapshot.pregnancy.days} (Trimester ${snapshot.pregnancy.trimester}) · ${snapshot.pregnancy.daysRemaining} days until due date (${formatShortDate(snapshot.pregnancy.dueDate)}).`;
  }

  const parts: string[] = [
    `LunaCycle Update (${snapshot.profileLabel}): ${PHASE_INFO[snapshot.phase].title}`,
  ];
  if (snapshot.cycleDay) {
    parts.push(`Cycle Day ${snapshot.cycleDay}`);
  }
  if (snapshot.isPeriodActiveToday) {
    parts.push('Period active today');
  } else if (snapshot.daysLate > 0) {
    parts.push(`Period ${snapshot.daysLate}d past expected`);
  } else if (snapshot.nextPeriodDate && snapshot.daysUntilNextPeriod !== null) {
    parts.push(`Next period in ${snapshot.daysUntilNextPeriod}d (${formatShortDate(snapshot.nextPeriodDate)})`);
  }
  const allSymptoms = [
    ...(snapshot.todaySymptoms ?? []).map((s) => SYMPTOM_LABEL_MAP[s]).filter(Boolean),
    ...(snapshot.todayCustomSymptoms ?? []),
  ];
  if (allSymptoms.length > 0) {
    parts.push(`Feeling: ${allSymptoms.slice(0, 3).join(', ')}`);
  }
  return parts.join(' · ') + '.';
}

export interface PartnerBodyForecast {
  energy: number; // 1..5
  moodSensitivity: number; // 1..5 (5 = extra tender/sensitive)
  socialBattery: number; // 1..5
  hormoneLine: string;
  planningCue: string;
}

export function getPartnerDailyBodyForecast(snapshot: PartnerSnapshot): PartnerBodyForecast {
  if (snapshot.mode === 'pregnancy' && snapshot.pregnancy) {
    const tri = snapshot.pregnancy.trimester;
    return tri === 1
      ? {
          energy: 2,
          moodSensitivity: 4,
          socialBattery: 2,
          hormoneLine: 'Early pregnancy hormones (hCG & progesterone) surge rapidly — fatigue and nausea are very common.',
          planningCue: 'Keep evenings quiet, bring light snacks, and take over kitchen/house errands.',
        }
      : tri === 2
        ? {
            energy: 4,
            moodSensitivity: 2,
            socialBattery: 4,
            hormoneLine: 'Second-trimester hormones settle — energy and comfort often rebound nicely.',
            planningCue: 'Great window for gentle walks, dates, and planning baby prep together.',
          }
        : {
            energy: 2,
            moodSensitivity: 3,
            socialBattery: 2,
            hormoneLine: 'Third-trimester physical load peaks — sleep and lower back comfort need extra care.',
            planningCue: 'Prioritize rest, foot/back rubs, and easy at-home plans.',
          };
  }

  switch (snapshot.phase) {
    case 'menstrual':
    case 'predicted_period':
      return {
        energy: 2,
        moodSensitivity: 4,
        socialBattery: 2,
        hormoneLine: 'Estrogen and progesterone are at their lowest — her body is working hard shedding the uterine lining.',
        planningCue: 'Cozy night in, warm food/tea, heating pad, and zero social pressure.',
      };
    case 'fertile':
    case 'ovulation':
      return {
        energy: 5,
        moodSensitivity: 2,
        socialBattery: 5,
        hormoneLine: 'Estrogen peaks around ovulation — energy, warmth, and social confidence are typically at their highest.',
        planningCue: 'Ideal window for dinner dates, outings, or unhurried quality time together.',
      };
    case 'luteal': {
      const nearPeriod = snapshot.daysUntilNextPeriod !== null && snapshot.daysUntilNextPeriod <= 5;
      return {
        energy: nearPeriod ? 2 : 3,
        moodSensitivity: nearPeriod ? 4 : 3,
        socialBattery: nearPeriod ? 2 : 3,
        hormoneLine: nearPeriod
          ? 'Progesterone is dipping ahead of her period (PMS window) — energy and patience can feel thinner.'
          : 'Progesterone rises in the luteal phase — her body craves steady meals, calm routines, and good sleep.',
        planningCue: nearPeriod
          ? 'Keep plans light, listen with extra warmth, and surprise her with a favorite comfort.'
          : 'Balanced low-key evenings, steady dinners, and early rest work best.',
      };
    }
    default:
      return {
        energy: 4,
        moodSensitivity: 2,
        socialBattery: 4,
        hormoneLine: 'Estrogen is steadily rising in the follicular phase — clarity, energy, and mood usually lift.',
        planningCue: 'Great time for weekend plans, walks, or tackling shared projects together.',
      };
  }
}

export function getPartnerKeyUpcomingDates(
  snapshot: PartnerSnapshot,
): Array<{ label: string; date: string; cue: string }> {
  if (snapshot.mode === 'pregnancy') return [];
  const items: Array<{ label: string; date: string; cue: string }> = [];

  if (snapshot.nextPeriodDate) {
    const pmsStart = addDays(snapshot.nextPeriodDate, -4);
    if (pmsStart >= snapshot.asOfDate) {
      items.push({
        label: 'PMS Window Starts',
        date: pmsStart,
        cue: 'Keep evenings lighter & stock favorite comfort snacks',
      });
    }
    if (snapshot.nextPeriodDate >= snapshot.asOfDate) {
      items.push({
        label: 'Expected Period',
        date: snapshot.nextPeriodDate,
        cue: 'Warm meals, heating pad, and extra rest',
      });
    }
  }
  if (snapshot.fertileStartDate && snapshot.fertileStartDate >= snapshot.asOfDate) {
    items.push({
      label: snapshot.mode === 'ttc' ? 'Fertile Window Opens' : 'High-Energy Window',
      date: snapshot.fertileStartDate,
      cue: snapshot.mode === 'ttc' ? 'Calm, unhurried time together' : 'Great week for dinner out or outings',
    });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
}

export interface PartnerCommunicationCue {
  sayThis: string;
  avoidThis: string;
}

export function getPartnerCommunicationCues(snapshot: PartnerSnapshot): PartnerCommunicationCue {
  const symptoms = new Set(snapshot.todaySymptoms ?? []);
  const moods = new Set(snapshot.todayMoods ?? []);

  if (snapshot.mode === 'pregnancy') {
    return {
      sayThis: '“You’re doing something huge right now — let me handle dinner and errands tonight.”',
      avoidThis: '“Why are you so tired already?” or comparing her pregnancy to someone else’s.',
    };
  }
  if (symptoms.has('cramps') || symptoms.has('backache') || snapshot.phase === 'menstrual') {
    return {
      sayThis: '“I’m warming up the heating pad and grabbing tea — zero pressure tonight.”',
      avoidThis: '“Is it really that bad?” or rushing her to stick to social plans.',
    };
  }
  if (
    moods.has('sensitive') ||
    moods.has('irritable') ||
    moods.has('anxious') ||
    moods.has('low') ||
    snapshot.phase === 'luteal'
  ) {
    return {
      sayThis: '“Do you want me to just listen, give you quiet space, or help fix this?”',
      avoidThis: '“Are you just moody because of your period?” (invalidating feelings always backfires).',
    };
  }
  if (snapshot.phase === 'ovulation' || snapshot.phase === 'fertile') {
    return {
      sayThis: '“You seem energized — want to plan a nice dinner out or a weekend walk?”',
      avoidThis: 'Over-scheduling without checking her energy first.',
    };
  }
  return {
    sayThis: '“How is your energy feeling today? Let’s plan something you’ll enjoy.”',
    avoidThis: 'Assuming every day feels the same — a quick check-in shows real care.',
  };
}

export function getSmartCarePingSuggestions(snapshot: PartnerSnapshot): string[] {
  const symptoms = new Set(snapshot.todaySymptoms ?? []);
  const moods = new Set(snapshot.todayMoods ?? []);
  const list: string[] = [];

  if (symptoms.has('cramps') || symptoms.has('backache')) {
    list.push('Warming up the heating pad & tea for you tonight');
  }
  if (symptoms.has('headache') || symptoms.has('fatigue') || symptoms.has('insomnia')) {
    list.push('Bringing water & keeping tonight super quiet so you can rest');
  }
  if (moods.has('sensitive') || moods.has('anxious') || moods.has('low')) {
    list.push('Thinking of you — big no-pressure hug waiting when you’re ready');
  }
  if (snapshot.phase === 'menstrual' || snapshot.phase === 'predicted_period') {
    list.push('Dinner is on me tonight — want dark chocolate or favorite snacks?');
  } else if (snapshot.phase === 'ovulation' || snapshot.phase === 'fertile' || snapshot.phase === 'follicular') {
    list.push('Want to grab dinner out or go for a nice evening walk tonight?');
  } else {
    list.push('Picking up warm tea or snacks on my way — need anything?');
  }

  const defaults = [
    'Thinking of you today — take it easy tonight',
    'Dinner is on me tonight — relax and rest',
    'Picking up a heating pad or warm tea — need anything?',
    'Want me to grab dark chocolate or your favorite snacks?',
  ];
  for (const d of defaults) {
    if (list.length >= 4) break;
    if (!list.includes(d)) list.push(d);
  }
  return list.slice(0, 4);
}

export function getPartnerSupportTips(snapshot: PartnerSnapshot): string[] {
  const tips: string[] = [];

  if (snapshot.mode === 'pregnancy' && snapshot.pregnancy) {
    if (snapshot.pregnancy.trimester === 1) {
      tips.push('First trimester fatigue and nausea can hit suddenly — keep light snacks and water handy.');
      tips.push('Take over strong-smelling kitchen chores and protect extra rest time.');
    } else if (snapshot.pregnancy.trimester === 2) {
      tips.push('Energy often steadies in Trimester 2 — great time for gentle walks and planning appointments together.');
      tips.push('Check in on lower back comfort and hydration throughout the day.');
    } else {
      tips.push('Third trimester rest matters most — help with lifting, errands, and comfortable sleep pillows.');
      tips.push('Keep hospital bag essentials and care provider contacts within easy reach.');
    }
    return tips;
  }

  const symptoms = new Set(snapshot.todaySymptoms ?? []);
  const moods = new Set(snapshot.todayMoods ?? []);

  if (symptoms.has('cramps') || symptoms.has('backache')) {
    tips.push('Cramps or backache logged today — offer a warm heating pad, tea, and take evening chores off their plate.');
  }
  if (symptoms.has('fatigue') || symptoms.has('insomnia')) {
    tips.push('Energy may be lower today — keep plans flexible and make space for an early, restful night.');
  }
  if (symptoms.has('headache') || symptoms.has('nausea')) {
    tips.push('Headache or nausea noted — keep lighting calm, offer water, and avoid heavy scents or loud plans.');
  }
  if (moods.has('sensitive') || moods.has('anxious') || moods.has('irritable') || moods.has('low')) {
    tips.push('Extra emotional tenderness today — listen without rushing to fix, and lead with warmth and patience.');
  }

  if (tips.length < 2) {
    switch (snapshot.phase) {
      case 'menstrual':
      case 'predicted_period':
        tips.push('Period window — stock comfort essentials, warm meals, and avoid unnecessary friction.');
        break;
      case 'fertile':
      case 'ovulation':
        tips.push(
          snapshot.mode === 'ttc'
            ? 'Peak fertility window — prioritize calm, unhurried time together.'
            : 'Energy and social drive often peak during this window — great time for shared activities.',
        );
        break;
      case 'luteal':
        tips.push('Late-cycle wind-down — steady meals, patience, and cozy low-key plans are usually appreciated.');
        break;
      default:
        tips.push('Follicular energy is building — great moment for outings, walks, or planning ahead together.');
    }
  }

  return tips.slice(0, 3);
}

export async function pushPartnerSnapshot(
  config: PartnerShareConfig,
  snapshot: PartnerSnapshot,
): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = config.syncServerUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    return { ok: false, error: 'No sync relay URL configured.' };
  }
  try {
    // End-to-End Encrypt on-device before uploading — Cloudflare KV only ever sees ciphertext
    const encryptedEnvelope = await encryptPartnerSnapshot(snapshot, config.code, config.pin);
    const res = await fetch(`${baseUrl}/sync/${encodeURIComponent(config.code.toUpperCase())}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encryptedEnvelope),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: err.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Offline or unable to reach relay.' };
  }
}

export async function fetchPartnerSnapshot(
  watch: PartnerWatchConfig,
): Promise<{ snapshot?: PartnerSnapshot; error?: string; pinRequired?: boolean }> {
  const baseUrl = watch.syncServerUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    return { error: 'Enter the sync relay URL first.' };
  }
  try {
    const res = await fetch(`${baseUrl}/sync/${encodeURIComponent(watch.code.toUpperCase())}`, {
      method: 'GET',
      headers: watch.pinHash ? { 'X-LunaCycle-Pin': watch.pinHash } : {},
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
      error?: string;
      pinRequired?: boolean;
    };
    if (!res.ok) {
      return {
        error: data.error || `HTTP ${res.status}`,
        pinRequired: Boolean(data.pinRequired),
      };
    }
    if (isPartnerE2eeEnvelope(data)) {
      try {
        const decrypted = await decryptPartnerSnapshot(data, watch.code, watch.pin);
        return { snapshot: decrypted };
      } catch {
        return { error: 'Unable to decrypt snapshot — check Partner Code and PIN.', pinRequired: true };
      }
    }
    return { snapshot: data as unknown as PartnerSnapshot };
  } catch {
    return { error: 'Offline or unable to reach relay.' };
  }
}

export async function deletePartnerSnapshot(
  config: PartnerShareConfig,
): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = config.syncServerUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) return { ok: true };
  try {
    const res = await fetch(`${baseUrl}/sync/${encodeURIComponent(config.code.toUpperCase())}`, {
      method: 'DELETE',
      headers: { 'X-LunaCycle-Write-Secret': config.writeSecret },
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: err.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not reach relay to delete old snapshot.' };
  }
}

export async function encryptPartnerCareThread(
  thread: PartnerCareThread,
  code: string,
  pin?: string,
): Promise<PartnerE2eeEnvelope> {
  const salt = new Uint8Array(new ArrayBuffer(16));
  const iv = new Uint8Array(new ArrayBuffer(12));
  crypto.getRandomValues(salt);
  crypto.getRandomValues(iv);

  const key = await derivePartnerKey(code, pin, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(thread));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return {
    e2ee: true,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: E2EE_ITERATIONS,
    saltBase64: toBase64(salt),
    ivBase64: toBase64(iv),
    ciphertextBase64: toBase64(new Uint8Array(ciphertext)),
    updatedAt: thread.updatedAt,
  };
}

export async function decryptPartnerCareThread(
  envelope: PartnerE2eeEnvelope,
  code: string,
  pin?: string,
): Promise<PartnerCareThread> {
  const salt = fromBase64(envelope.saltBase64);
  const iv = fromBase64(envelope.ivBase64);
  const ciphertext = fromBase64(envelope.ciphertextBase64);
  const key = await derivePartnerKey(code, pin, salt);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as PartnerCareThread | PartnerCarePing;
  if ('pings' in parsed && Array.isArray(parsed.pings)) {
    return parsed;
  }
  // Backwards compatibility with legacy single-ping payload
  const legacy = parsed as PartnerCarePing;
  return {
    pings: [{ ...legacy, direction: legacy.direction ?? 'to_primary', kind: legacy.kind ?? 'note' }],
    updatedAt: legacy.sentAt,
  };
}

export async function encryptPartnerCarePing(
  ping: PartnerCarePing,
  code: string,
  pin?: string,
): Promise<PartnerE2eeEnvelope> {
  return encryptPartnerCareThread({ pings: [ping], updatedAt: ping.sentAt }, code, pin);
}

export async function decryptPartnerCarePing(
  envelope: PartnerE2eeEnvelope,
  code: string,
  pin?: string,
): Promise<PartnerCarePing> {
  const thread = await decryptPartnerCareThread(envelope, code, pin);
  return thread.pings[0];
}

async function fetchCareThreadInternal(
  baseUrl: string,
  code: string,
  pin: string | undefined,
  headers: Record<string, string>,
): Promise<{ ok: boolean; thread?: PartnerCareThread }> {
  const res = await fetch(`${baseUrl}/care/${encodeURIComponent(code.toUpperCase())}`, {
    method: 'GET',
    headers,
  });
  if (!res.ok) return { ok: false };
  const body = (await res.json().catch(() => ({}))) as { thread?: unknown; ping?: unknown };
  const raw = body.thread ?? body.ping;
  if (!raw) {
    return { ok: true, thread: { pings: [], updatedAt: new Date().toISOString() } };
  }
  if (!isPartnerE2eeEnvelope(raw)) {
    return { ok: false };
  }
  try {
    const thread = await decryptPartnerCareThread(raw, code, pin);
    return { ok: true, thread };
  } catch {
    return { ok: false };
  }
}

export async function fetchCareThreadForPrimary(
  config: PartnerShareConfig,
): Promise<{ ok: boolean; thread?: PartnerCareThread }> {
  const baseUrl = config.syncServerUrl.trim().replace(/\/+$/, '');
  if (!baseUrl || !config.enabled) return { ok: false };
  try {
    return await fetchCareThreadInternal(baseUrl, config.code, config.pin, {
      'X-LunaCycle-Write-Secret': config.writeSecret,
    });
  } catch {
    return { ok: false };
  }
}

export async function fetchCareThreadForPartner(
  watch: PartnerWatchConfig,
): Promise<{ ok: boolean; thread?: PartnerCareThread }> {
  const baseUrl = watch.syncServerUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) return { ok: false };
  try {
    return await fetchCareThreadInternal(
      baseUrl,
      watch.code,
      watch.pin,
      watch.pinHash ? { 'X-LunaCycle-Pin': watch.pinHash } : {},
    );
  } catch {
    return { ok: false };
  }
}

export async function pushPartnerCarePing(
  watch: PartnerWatchConfig,
  message: string,
  senderLabel = 'Your Partner',
  kind: 'note' | 'hug' = 'note',
): Promise<{ ok: boolean; thread?: PartnerCareThread; error?: string }> {
  const baseUrl = watch.syncServerUrl.trim().replace(/\/+$/, '');
  const trimmed = message.trim();
  if (!baseUrl || !trimmed) return { ok: false, error: 'Enter a short message first.' };

  try {
    const fetched = await fetchCareThreadForPartner(watch);
    const existingPings = fetched.ok && fetched.thread ? fetched.thread.pings : [];
    if (!fetched.ok) {
      return { ok: false, error: 'Could not sync existing pings — check connection or PIN.' };
    }
    const ping: PartnerCarePing = {
      id: `care-${Date.now()}`,
      direction: 'to_primary',
      kind,
      message: trimmed.slice(0, 180),
      senderLabel: senderLabel.trim() || 'Your Partner',
      sentAt: new Date().toISOString(),
    };
    const nextThread: PartnerCareThread = {
      pings: [ping, ...existingPings].slice(0, 5),
      updatedAt: ping.sentAt,
    };
    const envelope = await encryptPartnerCareThread(nextThread, watch.code, watch.pin);
    const res = await fetch(`${baseUrl}/care/${encodeURIComponent(watch.code.toUpperCase())}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(watch.pinHash ? { 'X-LunaCycle-Pin': watch.pinHash } : {}),
      },
      body: JSON.stringify(envelope),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: err.error || `HTTP ${res.status}` };
    }
    return { ok: true, thread: nextThread };
  } catch {
    return { ok: false, error: 'Offline or unable to reach relay.' };
  }
}

export async function sendPrimaryCareRequestOrReaction(
  config: PartnerShareConfig,
  action:
    | { type: 'react'; pingId: string; reaction: string }
    | { type: 'request'; message: string },
): Promise<{ ok: boolean; thread?: PartnerCareThread; error?: string }> {
  const baseUrl = config.syncServerUrl.trim().replace(/\/+$/, '');
  if (!baseUrl || !config.enabled) return { ok: false, error: 'Enable Partner Sharing first.' };
  try {
    const fetched = await fetchCareThreadForPrimary(config);
    if (!fetched.ok || !fetched.thread) {
      return { ok: false, error: 'Offline or unable to reach relay.' };
    }
    const nowIso = new Date().toISOString();
    let nextPings = [...fetched.thread.pings];

    if (action.type === 'react') {
      nextPings = nextPings.map((p) =>
        p.id === action.pingId ? { ...p, reaction: action.reaction, seenAt: nowIso } : p,
      );
    } else {
      const reqPing: PartnerCarePing = {
        id: `req-${Date.now()}`,
        direction: 'to_partner',
        kind: 'request',
        message: action.message.trim().slice(0, 180),
        senderLabel: config.profileLabel.trim() || 'Your Partner',
        sentAt: nowIso,
      };
      nextPings = [reqPing, ...nextPings].slice(0, 5);
    }

    const nextThread: PartnerCareThread = { pings: nextPings, updatedAt: nowIso };
    const envelope = await encryptPartnerCareThread(nextThread, config.code, config.pin);
    const res = await fetch(`${baseUrl}/care/${encodeURIComponent(config.code.toUpperCase())}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-LunaCycle-Write-Secret': config.writeSecret,
      },
      body: JSON.stringify(envelope),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: err.error || `HTTP ${res.status}` };
    }
    return { ok: true, thread: nextThread };
  } catch {
    return { ok: false, error: 'Offline or unable to reach relay.' };
  }
}

export async function clearPartnerCarePing(config: PartnerShareConfig): Promise<void> {
  const baseUrl = config.syncServerUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) return;
  try {
    await fetch(`${baseUrl}/care/${encodeURIComponent(config.code.toUpperCase())}`, {
      method: 'DELETE',
      headers: { 'X-LunaCycle-Write-Secret': config.writeSecret },
    });
  } catch {
    // Ignore
  }
}
