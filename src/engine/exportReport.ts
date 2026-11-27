import { Capacitor } from '@capacitor/core';
import type { CycleStats, LunaData, PhaseSymptomInsight } from '../types';
import { FLOW_LABEL_MAP, MOOD_LABEL_MAP, SYMPTOM_LABEL_MAP } from './catalog';
import { computeBbtCoverline, computeClinicalHealthFlags, formatTemp } from './cycleEngine';
import { encryptPayload, isEncryptedEnvelope, decryptPayload, sanitizeLunaData } from './cryptoStorage';
import { compareDates, formatLongDate, formatShortDate } from './temporal';

async function triggerDownload(
  filename: string,
  content: string,
  mimeType: string,
): Promise<boolean> {
  const blob = new Blob([content], { type: mimeType });

  if (Capacitor.isNativePlatform() && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const file = new File([blob], filename, { type: mimeType });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return true;
      }
      await navigator.share({ title: filename, text: content.slice(0, 50_000) });
      return true;
    } catch {
      return false;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
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
): Promise<boolean> {
  const trimmed = passphrase?.trim();
  if (trimmed) {
    const envelope = await encryptPayload(data, trimmed);
    return triggerDownload(
      `lunacycle-encrypted-backup-${today}.json`,
      JSON.stringify(envelope, null, 2),
      'application/json',
    );
  }
  return triggerDownload(
    `lunacycle-backup-${today}.json`,
    JSON.stringify(data, null, 2),
    'application/json',
  );
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

export async function exportCsvLogs(data: LunaData, today: string): Promise<boolean> {
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

  return triggerDownload(`lunacycle-logs-${today}.csv`, csv, 'text/csv;charset=utf-8');
}

export function buildDoctorReportHtml(
  data: LunaData,
  stats: CycleStats,
  phaseInsights: PhaseSymptomInsight[],
  today: string,
  embeddedPreview = false,
): string {
  const recentPeriods = [...stats.periods].reverse().slice(0, 12);
  const bbtLogs = Object.values(data.logs)
    .filter((l): l is typeof l & { bbtC: number } => typeof l.bbtC === 'number')
    .sort((a, b) => compareDates(a.date, b.date))
    .slice(-16);

  const periodRows =
    recentPeriods.length > 0
      ? recentPeriods
          .map(
            (p) => `
          <tr>
            <td class="num"><strong>${escapeHtml(formatShortDate(p.startDate))}</strong> <span class="muted">(${escapeHtml(p.startDate)})</span></td>
            <td class="num">${escapeHtml(formatShortDate(p.endDate))}</td>
            <td class="num">${p.lengthDays} days</td>
            <td class="num">${p.cycleLengthToNext !== null ? `${p.cycleLengthToNext} days` : '<span class="pill">Current</span>'}</td>
          </tr>`,
          )
          .join('')
      : `<tr><td colspan="4" class="muted">No period logs recorded yet.</td></tr>`;

  const symptomRows = phaseInsights
    .filter((pi) => pi.topSymptoms.length > 0)
    .map(
      (pi) => `
      <tr>
        <td style="text-transform: capitalize; font-weight: 600;">${escapeHtml(pi.phase)}</td>
        <td>${pi.topSymptoms.map((s) => `<span class="tag">${escapeHtml(SYMPTOM_LABEL_MAP[s.id])} <span class="num">(${s.count}x)</span></span>`).join(' ')}</td>
      </tr>`,
    )
    .join('');

  const customSymptomCounts: Record<string, number> = {};
  let totalEstimatedMl = 0;
  for (const log of Object.values(data.logs)) {
    for (const cs of log.customSymptoms ?? []) {
      customSymptomCounts[cs] = (customSymptomCounts[cs] ?? 0) + 1;
    }
    for (const h of log.hygieneChanges ?? []) {
      totalEstimatedMl += h.estimatedMl;
    }
  }
  const customSymptomSummary = Object.entries(customSymptomCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, cnt]) => `${escapeHtml(name)} (${cnt}x)`)
    .join(', ');

  // Crisp vector BBT thermal-shift chart + coverline for OB-GYN readability
  let bbtChartHtml = '';
  if (bbtLogs.length >= 2) {
    const minT = Math.min(...bbtLogs.map((p) => p.bbtC)) - 0.12;
    const maxT = Math.max(...bbtLogs.map((p) => p.bbtC)) + 0.12;
    const range = Math.max(0.4, maxT - minT);
    const svgW = 560;
    const svgH = 128;
    const padL = 44;
    const padR = 16;
    const padT = 16;
    const padB = 24;
    const plotW = svgW - padL - padR;
    const plotH = svgH - padT - padB;
    const mapX = (idx: number) => padL + (idx / (bbtLogs.length - 1)) * plotW;
    const mapY = (c: number) => padT + plotH - ((c - minT) / range) * plotH;

    const pathD = bbtLogs
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${mapX(idx).toFixed(1)} ${mapY(pt.bbtC).toFixed(1)}`)
      .join(' ');
    const coverline = computeBbtCoverline(bbtLogs);
    const coverY =
      coverline.confirmed && coverline.coverlineC !== null ? mapY(coverline.coverlineC) : null;

    const circles = bbtLogs
      .map(
        (pt, idx) =>
          `<circle cx="${mapX(idx).toFixed(1)}" cy="${mapY(pt.bbtC).toFixed(1)}" r="3.4" fill="#6B1D2F" stroke="#FFFFFF" stroke-width="1.2" />`,
      )
      .join('');

    const midT = (minT + maxT) / 2;
    bbtChartHtml = `
      <svg viewBox="0 0 ${svgW} ${svgH}" role="img" aria-label="Basal Body Temperature thermal shift chart" style="width:100%;height:auto;display:block;margin-bottom:10px;">
        <line x1="${padL}" y1="${padT}" x2="${svgW - padR}" y2="${padT}" stroke="#EAE5DC" stroke-dasharray="3 3" />
        <line x1="${padL}" y1="${(padT + plotH / 2).toFixed(1)}" x2="${svgW - padR}" y2="${(padT + plotH / 2).toFixed(1)}" stroke="#EAE5DC" stroke-dasharray="3 3" />
        <line x1="${padL}" y1="${padT + plotH}" x2="${svgW - padR}" y2="${padT + plotH}" stroke="#D6CEC2" />
        <text x="${padL - 6}" y="${padT + 3}" text-anchor="end" font-size="9" fill="#57534E">${escapeHtml(formatTemp(maxT, data.settings.tempUnit))}</text>
        <text x="${padL - 6}" y="${(padT + plotH / 2 + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#57534E">${escapeHtml(formatTemp(midT, data.settings.tempUnit))}</text>
        <text x="${padL - 6}" y="${padT + plotH + 3}" text-anchor="end" font-size="9" fill="#57534E">${escapeHtml(formatTemp(minT, data.settings.tempUnit))}</text>
        ${
          coverY !== null
            ? `<line x1="${padL}" y1="${coverY.toFixed(1)}" x2="${svgW - padR}" y2="${coverY.toFixed(1)}" stroke="#C5A059" stroke-width="1.6" stroke-dasharray="5 3" />
               <text x="${svgW - padR}" y="${Math.max(11, coverY - 4).toFixed(1)}" text-anchor="end" font-size="9" font-weight="700" fill="#9A762F">Coverline ${escapeHtml(formatTemp(coverline.coverlineC!, data.settings.tempUnit))}</text>`
            : ''
        }
        <path d="${pathD}" fill="none" stroke="#2E5A4C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        ${circles}
        <text x="${padL}" y="${svgH - 6}" font-size="9" fill="#57534E">${escapeHtml(formatShortDate(bbtLogs[0].date))}</text>
        <text x="${svgW - padR}" y="${svgH - 6}" text-anchor="end" font-size="9" fill="#57534E">${escapeHtml(formatShortDate(bbtLogs[bbtLogs.length - 1].date))}</text>
      </svg>`;
  }

  const bbtSummary =
    bbtLogs.length > 0
      ? `<div class="bbt-grid">${[...bbtLogs]
          .reverse()
          .slice(0, 12)
          .map(
            (l) =>
              `<div class="bbt-cell"><span class="muted num">${escapeHtml(formatShortDate(l.date))}</span><strong class="num">${escapeHtml(formatTemp(l.bbtC, data.settings.tempUnit))}</strong></div>`,
          )
          .join('')}</div>`
      : '<span class="muted">No BBT measurements recorded.</span>';

  const regularityLabel =
    stats.regularity === 'regular'
      ? 'Regular (variation <= 7 days)'
      : stats.regularity === 'slightly_variable'
        ? 'Slightly variable (8–12 days)'
        : stats.regularity === 'irregular'
          ? 'Irregular — recommended to review with clinician'
          : 'Building baseline (< 2 completed cycles)';

  const clinicalFlags = computeClinicalHealthFlags(data.logs, stats);
  const clinicalFlagsHtml =
    clinicalFlags.length > 0
      ? `<section class="section">
  <h2>Clinical Pattern Notes (For Clinician Discussion)</h2>
  <div class="box box--accent">
    <ul style="margin: 0; padding-left: 18px;">
      ${clinicalFlags
        .map(
          (f) =>
            `<li style="margin-bottom: 6px;"><strong>${escapeHtml(f.title)}:</strong> ${escapeHtml(f.detail)}</li>`,
        )
        .join('')}
    </ul>
  </div>
  </section>`
      : '';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="referrer" content="no-referrer" />
  <title>LunaCycle Clinical Cycle Summary — ${escapeHtml(today)}</title>
  <style>
    @page {
      size: A4;
      margin: 14mm 15mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1C1917;
      background: #FFFFFF;
      margin: 0;
      padding: ${embeddedPreview ? '16px' : '28px 32px'};
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    .page-wrap {
      max-width: 780px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      flex-wrap: wrap;
      gap: 10px;
      border-bottom: 2px solid #6B1D2F;
      padding-bottom: 12px;
      margin-bottom: 18px;
      position: relative;
    }
    .header::after {
      content: "";
      position: absolute;
      left: 0;
      bottom: -2px;
      width: 96px;
      height: 2px;
      background: #C5A059;
    }
    h1 {
      font-family: Georgia, "Times New Roman", serif;
      color: #6B1D2F;
      margin: 0 0 4px 0;
      font-size: ${embeddedPreview ? '1.35rem' : '1.6rem'};
      line-height: 1.2;
      text-wrap: balance;
    }
    .meta { color: #57534E; font-size: 12.5px; }
    .mode-pill {
      display: inline-block;
      background: #F5ECEE;
      color: #6B1D2F;
      border: 1px solid #DFC5CB;
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }
    @media (min-width: 560px), print {
      .metrics { grid-template-columns: repeat(4, 1fr); }
    }
    .metric {
      border: 1px solid #EAE5DC;
      background: #FAFAF7;
      border-radius: 10px;
      padding: 11px 12px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .metric-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: #57534E; font-weight: 600; }
    .metric-val { font-size: 19px; font-weight: 700; color: #1C1917; font-variant-numeric: tabular-nums; margin-top: 3px; white-space: nowrap; }
    .section {
      break-inside: avoid;
      page-break-inside: avoid;
      margin-top: 18px;
    }
    h2 {
      font-family: Georgia, serif;
      font-size: 15.5px;
      color: #6B1D2F;
      margin: 0 0 8px 0;
      text-wrap: balance;
    }
    .table-wrap { width: 100%; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #EAE5DC; vertical-align: top; }
    th { background: #F5F1EB; font-weight: 600; color: #1C1917; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.03em; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .num { font-variant-numeric: tabular-nums; }
    .muted { color: #57534E; }
    .pill {
      display: inline-block;
      background: #F5ECEE;
      color: #6B1D2F;
      border-radius: 999px;
      padding: 1px 8px;
      font-size: 11px;
      font-weight: 600;
    }
    .tag {
      display: inline-block;
      background: #FAFAF7;
      border: 1px solid #E5DFD5;
      border-radius: 6px;
      padding: 2px 7px;
      margin: 2px 4px 2px 0;
      font-size: 11.5px;
    }
    .box {
      border: 1px solid #EAE5DC;
      border-radius: 10px;
      padding: 11px 13px;
      font-size: 12.5px;
      background: #FAFAF7;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .box--accent {
      border-left: 3.5px solid #C5A059;
    }
    .bbt-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
      gap: 6px;
    }
    .bbt-cell {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #FFFFFF;
      border: 1px solid #EAE5DC;
      border-radius: 6px;
      padding: 5px 8px;
      font-size: 11.5px;
    }
    .disclaimer {
      margin-top: 22px;
      padding-top: 10px;
      border-top: 1px solid #EAE5DC;
      font-size: 11px;
      color: #57534E;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .print-bar {
      margin-bottom: 16px;
      display: ${embeddedPreview ? 'none' : 'flex'};
      gap: 10px;
    }
    .btn {
      background: #6B1D2F;
      color: #FFFFFF;
      border: none;
      border-radius: 8px;
      min-height: 44px;
      padding: 10px 18px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 100ms cubic-bezier(0.23, 1, 0.32, 1), opacity 150ms ease-out;
    }
    .btn:active { transform: scale(0.97); }
    @media print {
      .print-bar { display: none !important; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="page-wrap">
  <div class="print-bar">
    <button class="btn" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="header">
    <div>
      <h1>Menstrual &amp; Wellness Cycle Summary</h1>
      <div class="meta">Generated privately on-device via LunaCycle &middot; <span class="num">${escapeHtml(formatLongDate(today))}</span></div>
    </div>
    <span class="mode-pill">MODE: ${escapeHtml(data.settings.mode.toUpperCase())}</span>
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

  <div class="box box--accent">
    <strong>Cycle Regularity:</strong> ${escapeHtml(regularityLabel)}
    ${
      data.settings.mode === 'pregnancy' && data.settings.pregnancyDueDate
        ? `<br /><strong>Estimated Due Date:</strong> <span class="num">${escapeHtml(data.settings.pregnancyDueDate)}</span>`
        : ''
    }
  </div>

  <section class="section">
    <h2>Recent Period History (Last 12)</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Start Date</th>
            <th>End Date</th>
            <th>Bleeding</th>
            <th>Cycle Length</th>
          </tr>
        </thead>
        <tbody>${periodRows}</tbody>
      </table>
    </div>
  </section>

  <section class="section">
    <h2>Recurring Symptoms by Phase</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Cycle Phase</th>
            <th>Most Frequent Symptoms</th>
          </tr>
        </thead>
        <tbody>${symptomRows || '<tr><td colspan="2" class="muted">No symptoms logged yet.</td></tr>'}</tbody>
      </table>
    </div>
  </section>

  <section class="section">
    <h2>Basal Body Temperature (BBT) &amp; Thermal Shift</h2>
    <div class="box">
      ${bbtChartHtml}
      ${bbtSummary}
    </div>
  </section>

  ${
    customSymptomSummary || totalEstimatedMl > 0
      ? `<section class="section">
  <h2>Custom Symptoms &amp; Flow Volume</h2>
  <div class="box">
    ${customSymptomSummary ? `<div><strong>Custom Symptoms Logged:</strong> ${customSymptomSummary}</div>` : ''}
    ${totalEstimatedMl > 0 ? `<div><strong>Total Estimated Flow Logged (Hygiene Timer):</strong> <span class="num">~${totalEstimatedMl} mL</span></div>` : ''}
  </div>
  </section>`
      : ''
  }

  ${clinicalFlagsHtml}

  <div class="disclaimer">
    <strong>Important Wellness &amp; Clinical Notice:</strong> This summary is compiled strictly from self-logged personal observations on the user&rsquo;s device. LunaCycle is a general wellness and personal record-keeping tool — NOT a clinical diagnostic device, medical device, or contraceptive method. Always consult a qualified OB-GYN or physician before making any medical, fertility, or medication decisions. Clinical reference bands reflect published ACOG (Committee Opinions No. 651 &amp; 700), FIGO, WHO, and NIH guidelines.
  </div>
  </div>
</body>
</html>`;

  return html;
}

export function openDoctorPdfReport(
  data: LunaData,
  stats: CycleStats,
  phaseInsights: PhaseSymptomInsight[],
  today: string,
): { mode: 'window' | 'modal'; html: string } {
  if (Capacitor.isNativePlatform()) {
    return {
      mode: 'modal',
      html: buildDoctorReportHtml(data, stats, phaseInsights, today, true),
    };
  }

  const reportWin = window.open('', '_blank');
  if (!reportWin) {
    return {
      mode: 'modal',
      html: buildDoctorReportHtml(data, stats, phaseInsights, today, true),
    };
  }

  const html = buildDoctorReportHtml(data, stats, phaseInsights, today, false);
  reportWin.document.open();
  reportWin.document.write(html);
  reportWin.document.close();
  return { mode: 'window', html };
}

export async function shareDoctorReportHtml(html: string, today: string): Promise<boolean> {
  return triggerDownload(`lunacycle-clinician-report-${today}.html`, html, 'text/html;charset=utf-8');
}
