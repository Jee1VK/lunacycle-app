import { beforeAll, describe, expect, it } from 'vitest';
import { computeCycleStats, computeTodaySummary } from '../cycleEngine';
import {
  buildImmediatePartnerCareAlert,
  buildScheduledPartnerCareAlerts,
} from '../partnerNotifications';
import { buildPartnerSnapshot, createDefaultPartnerShareConfig } from '../partnerSync';
import { ensureTemporal } from '../temporal';
import { createEmptyLog, createInitialData } from '../../types';

beforeAll(async () => {
  await ensureTemporal();
});

describe('partnerNotifications care reminders', () => {
  it('generates symptom-specific care alert when partner logs cramps', () => {
    const data = createInitialData();
    data.logs['2026-06-01'] = {
      ...createEmptyLog('2026-06-01'),
      flow: 'heavy',
      symptoms: ['cramps'],
    };
    const stats = computeCycleStats(data.logs, data.settings);
    const summary = computeTodaySummary('2026-06-01', data.logs, stats, data.settings);
    const cfg = createDefaultPartnerShareConfig();
    cfg.profileLabel = 'Diya';

    const snap = buildPartnerSnapshot(cfg, data, stats, summary);
    const alert = buildImmediatePartnerCareAlert(snap);
    expect(alert).not.toBeNull();
    expect(alert?.title).toContain('Diya');
    expect(alert?.body.toLowerCase()).toContain('heating pad');
  });

  it('schedules PMS, period-tomorrow, and fertile-window care reminders', () => {
    const data = createInitialData();
    data.logs['2026-06-01'] = { ...createEmptyLog('2026-06-01'), flow: 'medium' };
    const stats = computeCycleStats(data.logs, data.settings);
    const summary = computeTodaySummary('2026-06-05', data.logs, stats, data.settings);
    const cfg = createDefaultPartnerShareConfig();
    cfg.profileLabel = 'Diya';

    const snap = buildPartnerSnapshot(cfg, data, stats, summary);
    const scheduled = buildScheduledPartnerCareAlerts(snap);
    expect(scheduled.map((s) => s.id)).toEqual([
      'partner-pms',
      'partner-period-tomorrow',
      'partner-fertile-start',
    ]);
    expect(scheduled[0].scheduleDate).toBe('2026-06-26');
    expect(scheduled[1].scheduleDate).toBe('2026-06-28');
  });
});
