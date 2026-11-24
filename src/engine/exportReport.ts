import type { CycleStats, LunaData, PhaseSymptomInsight } from '../types';
import { FLOW_LABEL_MAP, MOOD_LABEL_MAP, SYMPTOM_LABEL_MAP } from './catalog';
import { formatTemp } from './cycleEngine';
import { encryptPayload, isEncryptedEnvelope, decryptPayload, sanitizeLunaData } from './cryptoStorage';
import { compareDates, formatLongDate, formatShortDate } from './temporal';

function triggerDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function exportJsonBackup(
  data: LunaData,
  today: string,
  passphrase?: string,
): Promise<void> {
  const trimmed = passphrase?.trim();
  if (trimmed) {
    const envelope = await encryptPayload(data, trimmed);
    triggerDownload(
      `lunacycle-encrypted-backup-${today}.json`,
      JSON.stringify(envelope, null, 2),
      'application/json',
    );
  } else {
    triggerDownload(
      `lunacycle-backup-${today}.json`,
      JSON.stringify(data, null, 2),
      'application/json',
    );
  }
}

export async function parseImportedBackup(
  fileText: string,
  passphrase?: string,
): Promise<{ status: 'ok'; data: LunaData } | { status: 'needs_passphrase' } | { status: 'error'; message: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileText);
  } catch {
    return { status: 'error', message: 'Invalid JSON file format.' };
  }

  if (isEncryptedEnvelope(parsed)) {
    if (!passphrase) {
      return { status: 'needs_passphrase' };
    }
    try {
      const decrypted = await decryptPayload(parsed, passphrase);
      return { status: 'ok', data: decrypted };
    } catch {
      return { status: 'error', message: 'Incorrect passphrase or corrupted encrypted backup.' };
    }
  }

  if (!parsed || typeof parsed !== 'object' || !('logs' in parsed)) {
    return { status: 'error', message: 'File does not match LunaCycle backup structure.' };
  }

  return { status: 'ok', data: sanitizeLunaData(parsed as Partial<LunaData>) };
}

export function exportCsvLogs(data: LunaData, today: string): void {
  const headers = [
    'Date',
    'Flow',
    'Symptoms',
    'Moods',
    'Cervical Mucus',
    'LH Test',
    `BBT (${data.settings.tempUnit})`,
    'Sleep (hrs)',
    'Water (glasses)',
    'Estimated Flow (mL)',
    'Notes',
  ];

  const sortedLogs = Object.values(data.logs).sort((a, b) => compareDates(a.date, b.date));

  const rows = sortedLogs.map((log) => {
    const allSymptoms = [
      ...log.symptoms.map((s) => SYMPTOM_LABEL_MAP[s]),
      ...(log.customSymptoms ?? []),
    ];
    const allMoods = [
      ...log.moods.map((m) => MOOD_LABEL_MAP[m]),
      ...(log.customMoods ?? []),
    ];
    const estMl = (log.hygieneChanges ?? []).reduce((sum, h) => sum + h.estimatedMl, 0);
    return [
      log.date,
      FLOW_LABEL_MAP[log.flow],
      allSymptoms.join('; '),
      allMoods.join('; '),
      log.mucus === 'none' ? '' : log.mucus,
      log.lhTest === 'none' ? '' : log.lhTest,
      typeof log.bbtC === 'number' ? formatTemp(log.bbtC, data.settings.tempUnit) : '',
      typeof log.sleepHours === 'number' ? String(log.sleepHours) : '',
      typeof log.waterGlasses === 'number' ? String(log.waterGlasses) : '',
      estMl > 0 ? String(estMl) : '',
      log.notes,
    ];
  });

  const csv = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ].join('\r\n');

  triggerDownload(`lunacycle-logs-${today}.csv`, csv, 'text/csv;charset=utf-8');
}

export function openDoctorPdfReport(
  data: LunaData,
  stats: CycleStats,
  phaseInsights: PhaseSymptomInsight[],
  today: string,
): boolean {
  const reportWin = window.open('', '_blank', 'noopener,noreferrer');
  if (!reportWin) return false;

  const recentPeriods = [...stats.periods].reverse().slice(0, 12);
  const bbtLogs = Object.values(data.logs)
    .filter((l) => typeof l.bbtC === 'number')
    .sort((a, b) => compareDates(b.date, a.date))
    .slice(0, 14);

  const periodRows =
    recentPeriods.length > 0
      ? recentPeriods
          .map(
            (p) => `
          <tr>
            <td>${escapeHtml(formatShortDate(p.startDate))} (${escapeHtml(p.startDate)})</td>
            <td>${escapeHtml(formatShortDate(p.endDate))}</td>
            <td class="num">${p.lengthDays} days</td>
            <td class="num">${p.cycleLengthToNext !== null ? `${p.cycleLengthToNext} days` : 'Current'}</td>
          </tr>`,
          )
          .join('')
      : `<tr><td colspan="4">No period logs recorded yet.</td></tr>`;

  const symptomRows = phaseInsights
    .filter((pi) => pi.topSymptoms.length > 0)
    .map(
      (pi) => `
      <tr>
        <td style="text-transform: capitalize;">${escapeHtml(pi.phase)}</td>
        <td>${pi.topSymptoms.map((s) => `${escapeHtml(SYMPTOM_LABEL_MAP[s.id])} (${s.count}x)`).join(', ')}</td>
      </tr>`,
    )
    .join('');

  const bbtSummary =
    bbtLogs.length > 0
      ? bbtLogs
          .map(
            (l) =>
              `<span><strong>${escapeHtml(l.date)}:</strong> ${escapeHtml(formatTemp(l.bbtC!, data.settings.tempUnit))}</span>`,
          )
          .join(' &middot; ')
      : 'No BBT measurements recorded.';

  const regularityLabel =
    stats.regularity === 'regular'
      ? 'Regular (variation <= 7 days)'
      : stats.regularity === 'slightly_variable'
        ? 'Slightly variable (8–12 days)'
        : stats.regularity === 'irregular'
          ? 'Irregular — recommended to review with clinician'
          : 'Building baseline (< 2 completed cycles)';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>LunaCycle Clinical Cycle Summary — ${escapeHtml(today)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1C1917;
      background: #FFFFFF;
      margin: 0;
      padding: 32px;
      line-height: 1.5;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 2px solid #6B1D2F;
      padding-bottom: 14px;
      margin-bottom: 24px;
    }
    h1 {
      font-family: Georgia, "Times New Roman", serif;
      color: #6B1D2F;
      margin: 0 0 4px 0;
      font-size: 26px;
    }
    .meta { color: #4B5563; font-size: 13px; }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    .metric {
      border: 1px solid #EAE5DC;
      background: #FAFAF7;
      border-radius: 8px;
      padding: 12px 14px;
    }
    .metric-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6B7280; }
    .metric-val { font-size: 20px; font-weight: 700; color: #1C1917; font-variant-numeric: tabular-nums; margin-top: 4px; }
    h2 {
      font-family: Georgia, serif;
      font-size: 17px;
      color: #6B1D2F;
      margin: 22px 0 10px 0;
    }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid #EAE5DC; }
    th { background: #F3EFEA; font-weight: 600; color: #1C1917; }
    .num { font-variant-numeric: tabular-nums; }
    .box {
      border: 1px solid #EAE5DC;
      border-radius: 8px;
      padding: 12px 14px;
      font-size: 13px;
      background: #FAFAF7;
    }
    .disclaimer {
      margin-top: 28px;
      padding-top: 12px;
      border-top: 1px solid #EAE5DC;
      font-size: 11.5px;
      color: #6B7280;
    }
    .print-bar {
      margin-bottom: 18px;
      display: flex;
      gap: 10px;
    }
    .btn {
      background: #6B1D2F;
      color: #FFFFFF;
      border: none;
      border-radius: 6px;
      padding: 10px 16px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    @media print {
      .print-bar { display: none; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <button class="btn" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="header">
    <div>
      <h1>Menstrual &amp; Wellness Cycle Summary</h1>
      <div class="meta">Generated privately on-device via LunaCycle &middot; ${escapeHtml(formatLongDate(today))}</div>
    </div>
    <div class="meta">Mode: <strong>${escapeHtml(data.settings.mode.toUpperCase())}</strong></div>
  </div>

  <div class="metrics">
    <div class="metric">
      <div class="metric-label">Avg Cycle Length</div>
      <div class="metric-val">${stats.averageCycleLength} days</div>
    </div>
    <div class="metric">
      <div class="metric-label">Avg Period Length</div>
      <div class="metric-val">${stats.averagePeriodLength} days</div>
    </div>
    <div class="metric">
      <div class="metric-label">Cycle Range</div>
      <div class="metric-val">${
        stats.minCycleLength !== null && stats.maxCycleLength !== null
          ? `${stats.minCycleLength}–${stats.maxCycleLength} d`
          : '—'
      }</div>
    </div>
    <div class="metric">
      <div class="metric-label">Logged Cycles</div>
      <div class="metric-val">${stats.periods.length}</div>
    </div>
  </div>

  <div class="box">
    <strong>Cycle Regularity:</strong> ${escapeHtml(regularityLabel)}
    ${
      data.settings.mode === 'pregnancy' && data.settings.pregnancyDueDate
        ? `<br /><strong>Estimated Due Date:</strong> ${escapeHtml(data.settings.pregnancyDueDate)}`
        : ''
    }
  </div>

  <h2>Recent Period History (Last 12)</h2>
  <table>
    <thead>
      <tr>
        <th>Start Date</th>
        <th>End Date</th>
        <th>Bleeding Duration</th>
        <th>Cycle Length</th>
      </tr>
    </thead>
    <tbody>${periodRows}</tbody>
  </table>

  <h2>Recurring Symptoms by Phase</h2>
  <table>
    <thead>
      <tr>
        <th>Cycle Phase</th>
        <th>Most Frequent Symptoms</th>
      </tr>
    </thead>
    <tbody>${symptomRows || '<tr><td colspan="2">No symptoms logged yet.</td></tr>'}</tbody>
  </table>

  <h2>Recent Basal Body Temperature (BBT)</h2>
  <div class="box">${bbtSummary}</div>

  <div class="disclaimer">
    Note: This summary is compiled strictly from self-logged personal observations on the user's device. It is intended to assist clinical conversations and is not a medical diagnosis or contraceptive method.
  </div>
</body>
</html>`;

  reportWin.document.open();
  reportWin.document.write(html);
  reportWin.document.close();
  return true;
}
