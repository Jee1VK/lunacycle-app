import { beforeAll, describe, expect, it } from 'vitest';
import { computeBbtCoverline } from '../cycleEngine';
import { importExternalHistory } from '../importers';
import { ensureTemporal } from '../temporal';

beforeAll(async () => {
  await ensureTemporal();
});

describe('Tier 2: Flo/Clue importer & BBT 3-over-6 coverline', () => {
  it('imports Flo JSON cycles and merges non-destructively', () => {
    const floJson = JSON.stringify({
      operational_data: {
        cycles: [
          { period_start_date: '2026-01-01', period_end_date: '2026-01-04' },
          { period_start_date: '2026-01-29', period_end_date: '2026-01-31' },
        ],
      },
    });
    const res = importExternalHistory(floJson, {});
    expect('error' in res).toBe(false);
    if (!('error' in res)) {
      expect(res.source).toBe('flo');
      expect(res.importedDays).toBe(7);
      expect(res.mergedLogs['2026-01-01'].flow).toBe('medium');
      expect(res.mergedLogs['2026-01-31'].flow).toBe('medium');
    }
  });

  it('imports Clue JSON and generic CSV period exports', () => {
    const clueJson = JSON.stringify({
      data: [
        { day: '2026-02-10', period: 'heavy' },
        { day: '2026-02-11', period: 'light' },
      ],
    });
    const clueRes = importExternalHistory(clueJson, {});
    expect('error' in clueRes).toBe(false);
    if (!('error' in clueRes)) {
      expect(clueRes.source).toBe('clue');
      expect(clueRes.mergedLogs['2026-02-10'].flow).toBe('heavy');
    }

    const csv = 'Date,Flow\n2026-03-01,medium\n2026-03-02,heavy\n2026-03-03,none';
    const csvRes = importExternalHistory(csv, {});
    expect('error' in csvRes).toBe(false);
    if (!('error' in csvRes)) {
      expect(csvRes.source).toBe('csv');
      expect(csvRes.importedDays).toBe(2);
    }
  });

  it('detects 3-over-6 sympto-thermal BBT coverline accurately', () => {
    const points = [
      { date: '2026-04-01', bbtC: 36.25 },
      { date: '2026-04-02', bbtC: 36.30 },
      { date: '2026-04-03', bbtC: 36.28 },
      { date: '2026-04-04', bbtC: 36.32 },
      { date: '2026-04-05', bbtC: 36.29 },
      { date: '2026-04-06', bbtC: 36.35 }, // max of prev 6 = 36.35
      { date: '2026-04-07', bbtC: 36.45 }, // > 36.35
      { date: '2026-04-08', bbtC: 36.52 }, // > 36.35
      { date: '2026-04-09', bbtC: 36.60 }, // >= 36.35 + 0.20 (36.55)
    ];

    const res = computeBbtCoverline(points);
    expect(res.confirmed).toBe(true);
    expect(res.coverlineC).toBe(36.40);
    expect(res.shiftStartDate).toBe('2026-04-07');
  });
});
