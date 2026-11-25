import { Activity, AlertCircle, FileText, Thermometer } from 'lucide-react';
import { SYMPTOM_LABEL_MAP } from '../engine/catalog';
import {
  classifyDate,
  computeBbtCoverline,
  computeClinicalHealthFlags,
  computePhaseSymptomInsights,
  formatTemp,
} from '../engine/cycleEngine';
import { compareDates, formatShortDate } from '../engine/temporal';
import type { CycleStats, LunaData } from '../types';
import { ArticleShelf } from './PartnerDiscoverSection';

interface InsightsViewProps {
  data: LunaData;
  stats: CycleStats;
  today: string;
  onExportDoctorPdf: () => void;
}

export function InsightsView({
  data,
  stats,
  today,
  onExportDoctorPdf,
}: InsightsViewProps) {
  const phaseInsights = computePhaseSymptomInsights(data.logs, stats, data.settings, today);
  const clinicalFlags = computeClinicalHealthFlags(data.logs, stats);
  const currentPhase = classifyDate(today, data.logs, stats, data.settings, today).phase;

  // Recent completed cycles for bar chart (oldest -> newest, up to 8)
  const completedPeriods = stats.periods
    .filter((p) => p.cycleLengthToNext !== null)
    .slice(-8);

  // BBT entries (oldest -> newest, up to 16)
  const bbtPoints = Object.values(data.logs)
    .filter((l): l is typeof l & { bbtC: number } => typeof l.bbtC === 'number')
    .sort((a, b) => compareDates(a.date, b.date))
    .slice(-16);

  const regularityCopy: Record<CycleStats['regularity'], { label: string; hint: string }> = {
    learning: { label: 'Learning', hint: 'Log 2+ completed cycles' },
    regular: { label: 'Regular', hint: 'Variation <= 7 days' },
    slightly_variable: { label: 'Variable', hint: '8–12 day variation' },
    irregular: { label: 'Irregular', hint: 'Consider sharing PDF with clinician' },
  };

  // BBT SVG geometry
  const minTemp = bbtPoints.length > 0 ? Math.min(...bbtPoints.map((p) => p.bbtC)) - 0.1 : 36.0;
  const maxTemp = bbtPoints.length > 0 ? Math.max(...bbtPoints.map((p) => p.bbtC)) + 0.1 : 37.2;
  const tempRange = Math.max(0.4, maxTemp - minTemp);

  const bbtSvgPath =
    bbtPoints.length >= 2
      ? bbtPoints
          .map((pt, idx) => {
            const x = 18 + (idx / (bbtPoints.length - 1)) * 284;
            const y = 112 - ((pt.bbtC - minTemp) / tempRange) * 92;
            return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(' ')
      : '';

  const coverline = computeBbtCoverline(bbtPoints);
  const coverlineY =
    coverline.confirmed && coverline.coverlineC !== null
      ? 112 - ((coverline.coverlineC - minTemp) / tempRange) * 92
      : null;

  return (
    <>
      {/* Top Metrics Bento */}
      <section className="metrics-grid" aria-label="Cycle statistics summary">
        <div className="metric-tile">
          <div className="metric-label">Avg Cycle</div>
          <div className="metric-value tabular">{stats.averageCycleLength} days</div>
          <div className="metric-sub">
            {stats.minCycleLength !== null && stats.maxCycleLength !== null
              ? `Range ${stats.minCycleLength}–${stats.maxCycleLength}d`
              : 'Default baseline'}
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-label">Avg Period</div>
          <div className="metric-value tabular">{stats.averagePeriodLength} days</div>
          <div className="metric-sub">Normal range: 2–7d</div>
        </div>
        <div className="metric-tile">
          <div className="metric-label">Regularity</div>
          <div className="metric-value" style={{ fontSize: '1.4rem' }}>
            {regularityCopy[stats.regularity].label}
          </div>
          <div className="metric-sub">{regularityCopy[stats.regularity].hint}</div>
        </div>
        <div className="metric-tile">
          <div className="metric-label">Logged Periods</div>
          <div className="metric-value tabular">{stats.periods.length}</div>
          <div className="metric-sub">
            {stats.completedCycleLengths.length} completed cycles
          </div>
        </div>
      </section>

      {/* Clinical Pattern Flags for Doctor Visits */}
      {clinicalFlags.length > 0 ? (
        <section className="card" aria-label="Clinical pattern flags">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={18} color="var(--color-brand-primary)" />
              <h2 className="section-title" style={{ margin: 0 }}>
                Patterns to Share with a Doctor
              </h2>
            </div>
          </div>
          <p className="section-caption" style={{ marginBottom: 10 }}>
            Informational cues from your logs — automatically included in your Doctor PDF
          </p>
          <div className="reminder-list">
            {clinicalFlags.map((flag) => (
              <div
                key={flag.id}
                className={`reminder-item ${flag.severity === 'attention' ? 'reminder-item--period' : 'reminder-item--gentle'}`}
              >
                <div>
                  <p className="reminder-title">{flag.title}</p>
                  <p className="reminder-body">{flag.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Doctor Report Quick Action */}
      <section className="card-subtle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <strong style={{ fontSize: '0.92rem' }}>Clinician / OB-GYN Summary</strong>
          <p className="section-caption">Generate a clean printable PDF summary of your cycles &amp; symptoms.</p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={onExportDoctorPdf}
          style={{ flexShrink: 0 }}
        >
          <FileText size={16} />
          PDF Report
        </button>
      </section>

      {/* Cycle Length History Chart */}
      <section className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <h2 className="section-title">Cycle Length History</h2>
            <p className="section-caption">Typical healthy adult range highlighted (21–35 days)</p>
          </div>
          <Activity size={18} color="var(--color-brand-primary)" />
        </div>

        {completedPeriods.length > 0 ? (
          <svg
            viewBox="0 0 320 156"
            role="img"
            aria-label="Bar chart of recent completed cycle lengths"
            style={{ width: '100%', height: 'auto', display: 'block', marginTop: 8 }}
          >
            {/* Normal 21–35d shaded band (scale 0..45 days mapped to y 130..14) */}
            <rect
              x="12"
              y={130 - (35 / 45) * 114}
              width="296"
              height={((35 - 21) / 45) * 114}
              fill="var(--color-brand-secondary-soft)"
              rx="4"
            />
            <text x="16" y={130 - (35 / 45) * 114 + 11} fontSize="9" fill="var(--color-brand-secondary)">
              21–35d typical band
            </text>

            {completedPeriods.map((p, idx) => {
              const len = p.cycleLengthToNext ?? 28;
              const capped = Math.min(45, len);
              const barH = (capped / 45) * 114;
              const slotW = 296 / completedPeriods.length;
              const barW = Math.min(30, slotW * 0.56);
              const x = 12 + idx * slotW + (slotW - barW) / 2;
              const y = 130 - barH;
              const isNormal = len >= 21 && len <= 35;

              return (
                <g key={p.startDate}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={barH}
                    rx="5"
                    fill={isNormal ? 'var(--color-brand-primary)' : 'var(--color-brand-accent)'}
                  />
                  <text
                    x={x + barW / 2}
                    y={y - 4}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill="var(--color-text-primary)"
                  >
                    {len}d
                  </text>
                  <text
                    x={x + barW / 2}
                    y="146"
                    textAnchor="middle"
                    fontSize="9"
                    fill="var(--color-text-muted)"
                  >
                    {formatShortDate(p.startDate)}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : (
          <p style={{ margin: '10px 0 0', fontSize: '0.86rem', color: 'var(--color-text-muted)' }}>
            Log at least 2 periods to see your cycle length chart and trend band.
          </p>
        )}
      </section>

      {/* BBT Trend Chart */}
      <section className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <h2 className="section-title">Basal Body Temperature (BBT)</h2>
            <p className="section-caption">
              Sustained temperature rise (~0.2–0.4 °C) often confirms ovulation
            </p>
          </div>
          <Thermometer size={18} color="var(--color-brand-secondary)" />
        </div>

        {bbtPoints.length >= 2 ? (
          <>
            <svg
              viewBox="0 0 320 132"
              role="img"
              aria-label="Basal body temperature trend chart"
              style={{ width: '100%', height: 'auto', display: 'block', marginTop: 8 }}
            >
              <line x1="18" y1="20" x2="302" y2="20" stroke="var(--color-border-subtle)" strokeDasharray="3 3" />
              <line x1="18" y1="66" x2="302" y2="66" stroke="var(--color-border-subtle)" strokeDasharray="3 3" />
              <line x1="18" y1="112" x2="302" y2="112" stroke="var(--color-border-subtle)" />
              {coverlineY !== null ? (
                <g>
                  <line
                    x1="18"
                    y1={coverlineY}
                    x2="302"
                    y2={coverlineY}
                    stroke="var(--color-brand-accent)"
                    strokeWidth="1.8"
                    strokeDasharray="5 4"
                  />
                  <text
                    x="298"
                    y={Math.max(12, coverlineY - 4)}
                    textAnchor="end"
                    fontSize="9"
                    fontWeight="700"
                    fill="var(--color-brand-accent)"
                  >
                    Coverline {coverline.coverlineC !== null ? formatTemp(coverline.coverlineC, data.settings.tempUnit) : ''}
                  </text>
                </g>
              ) : null}
              <path
                d={bbtSvgPath}
                fill="none"
                stroke="var(--color-brand-secondary)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {bbtPoints.map((pt, idx) => {
                const x = 18 + (idx / (bbtPoints.length - 1)) * 284;
                const y = 112 - ((pt.bbtC - minTemp) / tempRange) * 92;
                return (
                  <circle
                    key={pt.date}
                    cx={x}
                    cy={y}
                    r="3.8"
                    fill="var(--color-brand-accent)"
                    stroke="var(--color-brand-secondary)"
                    strokeWidth="1.5"
                  />
                );
              })}
            </svg>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.78rem',
                color: 'var(--color-text-secondary)',
                marginTop: 4,
              }}
              className="tabular"
            >
              <span>Low: {formatTemp(Math.min(...bbtPoints.map((p) => p.bbtC)), data.settings.tempUnit)}</span>
              <span>Latest: {formatTemp(bbtPoints[bbtPoints.length - 1].bbtC, data.settings.tempUnit)}</span>
              <span>High: {formatTemp(Math.max(...bbtPoints.map((p) => p.bbtC)), data.settings.tempUnit)}</span>
            </div>
          </>
        ) : (
          <p style={{ margin: '10px 0 0', fontSize: '0.86rem', color: 'var(--color-text-muted)' }}>
            Log morning BBT on 2 or more days to plot your thermal shift curve.
          </p>
        )}
      </section>

      {/* Symptom Patterns by Phase */}
      <section className="card">
        <h2 className="section-title">Symptom Patterns by Phase</h2>
        <p className="section-caption" style={{ marginBottom: 12 }}>
          Top recurring cues grouped by where they appear in your cycle
        </p>

        {phaseInsights.some((p) => p.topSymptoms.length > 0) ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {phaseInsights
              .filter((p) => p.topSymptoms.length > 0)
              .map((pi) => (
                <div key={pi.phase} className="card-subtle" style={{ padding: '10px 12px' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.86rem', textTransform: 'capitalize', marginBottom: 6 }}>
                    {pi.phase} Phase
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {pi.topSymptoms.map((s) => (
                      <span key={s.id} className="phase-badge phase-badge--follicular tabular">
                        {SYMPTOM_LABEL_MAP[s.id]} · {s.count}x
                      </span>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--color-text-muted)' }}>
            Log symptoms as you go to uncover recurring patterns across each cycle phase.
          </p>
        )}
      </section>

      {/* Phase-Matched Offline Cycle & Wellness Articles */}
      <ArticleShelf
        heading="Based on your current cycle"
        phase={currentPhase}
        excludeLibido={data.settings.simpleMode}
      />

      {/* Full Period History */}
      <section className="card">
        <h2 className="section-title">Period History</h2>
        {stats.periods.length > 0 ? (
          <div style={{ marginTop: 8 }}>
            {[...stats.periods].reverse().map((p) => (
              <div key={p.startDate} className="history-row">
                <div>
                  <strong style={{ fontSize: '0.92rem' }}>
                    {formatShortDate(p.startDate)} – {formatShortDate(p.endDate)}
                  </strong>
                  <div className="section-caption tabular">
                    Bleeding: {p.lengthDays} {p.lengthDays === 1 ? 'day' : 'days'}
                  </div>
                </div>
                <span className="phase-badge phase-badge--menstrual tabular">
                  {p.cycleLengthToNext !== null ? `${p.cycleLengthToNext}d cycle` : 'Current'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: '8px 0 0', fontSize: '0.86rem', color: 'var(--color-text-muted)' }}>
            No periods recorded yet.
          </p>
        )}
      </section>
    </>
  );
}
