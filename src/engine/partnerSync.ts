import type {
  CycleStats,
  LunaData,
  PartnerShareConfig,
  PartnerSnapshot,
  PartnerWatchConfig,
  TodaySummary,
} from '../types';
import { PHASE_INFO, SYMPTOM_LABEL_MAP } from './catalog';
import { classifyDate } from './cycleEngine';
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
    },
  };
}

/**
 * Builds a strictly privacy-scoped snapshot for the connected partner.
 * NEVER includes private journal notes, BBT decimals, LH strip results, or intimacy logs.
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

  const upcomingDays = permissions.shareUpcomingForecast
    ? Array.from({ length: 14 }, (_, idx) => {
        const d = addDays(summary.today, idx);
        const c = classifyDate(d, data.logs, stats, data.settings, summary.today);
        return { date: d, phase: c.phase };
      })
    : undefined;

  return {
    version: 1,
    code: config.code.toUpperCase(),
    profileLabel: config.profileLabel.trim() || 'My Cycle',
    updatedAt: now.toISOString(),
    asOfDate: summary.today,
    mode: summary.mode,
    phase: summary.phase,
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
    todayMoods: permissions.shareSymptomsAndMood ? (todayLog?.moods ?? []) : undefined,
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
  if (snapshot.todaySymptoms && snapshot.todaySymptoms.length > 0) {
    const top = snapshot.todaySymptoms
      .slice(0, 3)
      .map((s) => SYMPTOM_LABEL_MAP[s])
      .join(', ');
    parts.push(`Feeling: ${top}`);
  }
  return parts.join(' · ') + '.';
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
    const res = await fetch(`${baseUrl}/sync/${encodeURIComponent(config.code.toUpperCase())}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
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
    const data = (await res.json().catch(() => ({}))) as Partial<PartnerSnapshot> & {
      error?: string;
      pinRequired?: boolean;
    };
    if (!res.ok) {
      return {
        error: data.error || `HTTP ${res.status}`,
        pinRequired: Boolean(data.pinRequired),
      };
    }
    return { snapshot: data as PartnerSnapshot };
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
