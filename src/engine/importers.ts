import type { DailyLog, FlowLevel } from '../types';
import { createEmptyLog } from '../types';
import { addDays, compareDates } from './temporal';

export interface ImportResult {
  source: 'flo' | 'clue' | 'csv';
  importedDays: number;
  mergedLogs: Record<string, DailyLog>;
}

function normalizeFlow(raw: unknown): FlowLevel {
  const s = String(raw ?? '').toLowerCase().trim();
  if (!s || s === 'none' || s === '0' || s === 'false') return 'none';
  if (s.includes('spot')) return 'spotting';
  if (s.includes('heavy') || s === '3' || s === 'super') return 'heavy';
  if (s.includes('med') || s === '2' || s === 'normal' || s === 'yes' || s === 'true' || s === '1') {
    return 'medium';
  }
  if (s.includes('light')) return 'light';
  return 'medium';
}

function isIsoDate(val: unknown): val is string {
  return typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val);
}

function toIsoDate(val: string): string {
  return val.slice(0, 10);
}

/**
 * Imports historical period logs from exported Flo JSON, Clue JSON, or generic CSV files,
 * merging non-destructively with existing LunaCycle logs.
 */
export function importExternalHistory(
  fileText: string,
  existingLogs: Record<string, DailyLog>,
): ImportResult | { error: string } {
  const trimmed = fileText.trim();
  if (!trimmed) return { error: 'File is empty.' };

  const merged: Record<string, DailyLog> = { ...existingLogs };
  let importedDays = 0;

  const upsertFlow = (date: string, flow: FlowLevel) => {
    if (flow === 'none') return;
    const prev = merged[date] ?? createEmptyLog(date);
    merged[date] = { ...prev, date, flow };
    importedDays += 1;
  };

  // 1. Try JSON (Flo GDPR export or Clue backup)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;

      // Clue JSON format: { data: [ { day: "YYYY-MM-DD", period: "heavy" | ... } ] }
      if (Array.isArray(parsed.data)) {
        for (const item of parsed.data) {
          if (!item || typeof item !== 'object') continue;
          const rec = item as Record<string, unknown>;
          if (isIsoDate(rec.day) && rec.period) {
            upsertFlow(toIsoDate(rec.day), normalizeFlow(rec.period));
          }
        }
        if (importedDays > 0) {
          return { source: 'clue', importedDays, mergedLogs: merged };
        }
      }

      // Flo JSON format: { operational_data: { cycles: [...] } } or { cycles: [...] }
      const opData = parsed.operational_data as Record<string, unknown> | undefined;
      const cycles = Array.isArray(opData?.cycles)
        ? opData.cycles
        : Array.isArray(parsed.cycles)
          ? parsed.cycles
          : null;

      if (cycles) {
        for (const c of cycles) {
          if (!c || typeof c !== 'object') continue;
          const rec = c as Record<string, unknown>;
          const start = rec.period_start_date ?? rec.periodStartDate ?? rec.start_date;
          const end = rec.period_end_date ?? rec.periodEndDate ?? rec.end_date ?? start;
          if (isIsoDate(start) && isIsoDate(end)) {
            let cursor = toIsoDate(start);
            const endIso = toIsoDate(end);
            let guard = 0;
            while (compareDates(cursor, endIso) <= 0 && guard < 15) {
              upsertFlow(cursor, 'medium');
              cursor = addDays(cursor, 1);
              guard += 1;
            }
          }
        }
        if (importedDays > 0) {
          return { source: 'flo', importedDays, mergedLogs: merged };
        }
      }

      return { error: 'JSON file did not contain recognizable Flo or Clue cycle records.' };
    } catch {
      return { error: 'Could not parse JSON file.' };
    }
  }

  // 2. Fallback: CSV (Date + Flow/Period/Bleeding columns)
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { error: 'CSV must contain a header row and at least one data row.' };
  }

  const headers = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim().toLowerCase());
  const dateIdx = headers.findIndex((h) => h.includes('date') || h === 'day');
  const flowIdx = headers.findIndex(
    (h) => h.includes('flow') || h.includes('period') || h.includes('bleed'),
  );

  if (dateIdx === -1) {
    return { error: 'CSV header must include a "Date" column.' };
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
    const rawDate = cols[dateIdx];
    if (!isIsoDate(rawDate)) continue;
    const flowVal = flowIdx >= 0 ? normalizeFlow(cols[flowIdx]) : 'medium';
    if (flowVal !== 'none') {
      upsertFlow(toIsoDate(rawDate), flowVal);
    }
  }

  if (importedDays === 0) {
    return { error: 'No valid period dates found in CSV.' };
  }

  return { source: 'csv', importedDays, mergedLogs: merged };
}
