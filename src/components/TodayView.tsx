import {
  Baby,
  Bell,
  CalendarPlus,
  Droplets,
  Plus,
  Sparkles,
  Sun,
} from 'lucide-react';
import {
  FLOW_LABEL_MAP,
  MOOD_LABEL_MAP,
  PHASE_INFO,
  SYMPTOM_LABEL_MAP,
} from '../engine/catalog';
import { classifyDate, formatTemp } from '../engine/cycleEngine';
import type { ActiveReminder } from '../engine/reminders';
import {
  addDays,
  formatShortDate,
  formatWeekdayShort,
  getDayOfMonth,
} from '../engine/temporal';
import type { CycleStats, LunaData, TodaySummary } from '../types';

interface TodayViewProps {
  data: LunaData;
  stats: CycleStats;
  summary: TodaySummary;
  reminders: ActiveReminder[];
  onQuickTogglePeriodToday: () => void;
  onOpenLogDialog: (date: string) => void;
  onLoadSampleData: () => void;
  onJumpToCalendarEdit: () => void;
}

export function TodayView({
  data,
  stats,
  summary,
  reminders,
  onQuickTogglePeriodToday,
  onOpenLogDialog,
  onLoadSampleData,
  onJumpToCalendarEdit,
}: TodayViewProps) {
  const phaseInfo = PHASE_INFO[summary.phase];
  const todayLog = data.logs[summary.today];

  // Build 7-day strip: 5 days back, today, 1 day forward
  const weekDates = [-5, -4, -3, -2, -1, 0, 1].map((offset) => addDays(summary.today, offset));

  // SVG Ring Math
  const r = 96;
  const circumference = 2 * Math.PI * r;
  const totalCycle = Math.max(21, stats.averageCycleLength);

  // Arc lengths
  const periodArc = (stats.averagePeriodLength / totalCycle) * circumference;
  const ovDayOffset = Math.max(6, totalCycle - data.settings.lutealLength);
  const fertileStartRatio = Math.max(0, (ovDayOffset - 5) / totalCycle);
  const fertileArc = (7 / totalCycle) * circumference;

  const progressRatio =
    summary.mode === 'pregnancy' && summary.pregnancy
      ? summary.pregnancy.progressPercent / 100
      : summary.cycleDay
        ? Math.min(1, summary.cycleDay / totalCycle)
        : 0;

  // Position of today's indicator dot on the ring (ring starts at 12 o'clock via -90deg SVG rotate)
  const dotAngleRad = progressRatio * 2 * Math.PI;
  const dotX = 116 + r * Math.cos(dotAngleRad);
  const dotY = 116 + r * Math.sin(dotAngleRad);

  return (
    <>
      {/* Hero Cycle / Pregnancy Ring */}
      <section className="card hero-card" aria-label="Current cycle overview">
        <span className={`phase-badge phase-badge--${summary.phase}`}>
          {summary.mode === 'pregnancy' ? (
            <Baby size={14} />
          ) : summary.phase === 'ovulation' || summary.phase === 'fertile' ? (
            <Sparkles size={14} />
          ) : (
            <Droplets size={14} />
          )}
          {summary.mode === 'pregnancy' && summary.pregnancy
            ? `Trimester ${summary.pregnancy.trimester}`
            : phaseInfo.shortLabel}
          {summary.mode === 'ttc' ? ' · TTC' : ''}
        </span>

        <div className="cycle-ring-wrap">
          <svg className="cycle-ring-svg" viewBox="0 0 232 232" aria-hidden="true">
            {/* Base track */}
            <circle
              cx="116"
              cy="116"
              r={r}
              fill="none"
              stroke="var(--color-surface-elevated)"
              strokeWidth="14"
            />

            {summary.mode === 'pregnancy' && summary.pregnancy ? (
              <circle
                cx="116"
                cy="116"
                r={r}
                fill="none"
                stroke="var(--color-brand-primary)"
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${progressRatio * circumference} ${circumference}`}
              />
            ) : stats.hasLoggedPeriods ? (
              <>
                {/* Period Segment */}
                <circle
                  cx="116"
                  cy="116"
                  r={r}
                  fill="none"
                  stroke="var(--color-brand-primary)"
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={`${periodArc} ${circumference}`}
                />
                {/* Fertile Window Segment */}
                <circle
                  cx="116"
                  cy="116"
                  r={r}
                  fill="none"
                  stroke="var(--color-brand-secondary)"
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={`${fertileArc} ${circumference}`}
                  strokeDashoffset={-fertileStartRatio * circumference}
                  opacity="0.85"
                />
                {/* Current Day Indicator Dot */}
                {summary.cycleDay ? (
                  <circle
                    cx={dotX}
                    cy={dotY}
                    r="8"
                    fill="var(--color-brand-accent)"
                    stroke="#FFFFFF"
                    strokeWidth="3"
                  />
                ) : null}
              </>
            ) : null}
          </svg>

          <div className="cycle-ring-center">
            {summary.mode === 'pregnancy' ? (
              summary.pregnancy ? (
                <>
                  <span className="ring-eyebrow">Gestation</span>
                  <h2 className="ring-headline tabular">
                    {summary.pregnancy.weeks}w {summary.pregnancy.days}d
                  </h2>
                  <p className="ring-sub tabular">
                    {summary.pregnancy.daysRemaining} days to due date (
                    {formatShortDate(summary.pregnancy.dueDate)})
                  </p>
                </>
              ) : (
                <>
                  <span className="ring-eyebrow">Pregnancy Mode</span>
                  <h2 className="ring-headline">Set Dates</h2>
                  <p className="ring-sub">Add your LMP or due date in Settings.</p>
                </>
              )
            ) : !stats.hasLoggedPeriods ? (
              <>
                <span className="ring-eyebrow">Welcome</span>
                <h2 className="ring-headline">Day 1</h2>
                <p className="ring-sub">Log your last period to unlock private predictions.</p>
              </>
            ) : summary.isPeriodActiveToday ? (
              <>
                <span className="ring-eyebrow">Period Active</span>
                <h2 className="ring-headline tabular">Day {summary.cycleDay ?? 1}</h2>
                <p className="ring-sub">
                  {todayLog ? `${FLOW_LABEL_MAP[todayLog.flow]} flow logged today` : 'Bleeding logged'}
                </p>
              </>
            ) : summary.daysLate > 0 ? (
              <>
                <span className="ring-eyebrow">Cycle Day {summary.cycleDay}</span>
                <h2 className="ring-headline tabular">{summary.daysLate}d Late</h2>
                <p className="ring-sub">
                  Expected {summary.nextPeriodDate ? formatShortDate(summary.nextPeriodDate) : 'soon'}
                </p>
              </>
            ) : (
              <>
                <span className="ring-eyebrow tabular">Cycle Day {summary.cycleDay ?? '—'}</span>
                <h2 className="ring-headline tabular">
                  {summary.daysUntilNextPeriod === 0
                    ? 'Today'
                    : `${summary.daysUntilNextPeriod} Days`}
                </h2>
                <p className="ring-sub">
                  {summary.daysUntilNextPeriod === 0
                    ? 'Period predicted today'
                    : `until next period (${summary.nextPeriodDate ? formatShortDate(summary.nextPeriodDate) : ''})`}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Primary Action Row */}
        <div className="btn-row" style={{ width: '100%' }}>
          {summary.mode !== 'pregnancy' ? (
            <button
              type="button"
              className="btn-primary"
              onClick={onQuickTogglePeriodToday}
            >
              <Droplets size={18} />
              {summary.isPeriodActiveToday ? 'Period Ended / Remove Today' : 'Log Period Today'}
            </button>
          ) : null}
          <button
            type="button"
            className={summary.mode === 'pregnancy' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => onOpenLogDialog(summary.today)}
          >
            <Plus size={18} />
            Log Symptoms &amp; Notes
          </button>
        </div>

        {/* First-time Onboarding Shortcuts */}
        {!stats.hasLoggedPeriods && summary.mode !== 'pregnancy' ? (
          <div className="card-subtle" style={{ width: '100%', textAlign: 'left' }}>
            <p style={{ margin: '0 0 10px', fontSize: '0.84rem', color: 'var(--color-text-secondary)' }}>
              Want to add past period dates right away, or explore charts with sample data?
            </p>
            <div className="btn-row">
              <button type="button" className="btn-secondary" onClick={onJumpToCalendarEdit}>
                <CalendarPlus size={16} />
                Mark Past Periods
              </button>
              <button type="button" className="btn-secondary" onClick={onLoadSampleData}>
                <Sparkles size={16} />
                Load Sample Cycles
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* Active Reminders */}
      {reminders.length > 0 ? (
        <section className="reminder-list" aria-label="Active reminders">
          {reminders.map((rem) => (
            <div key={rem.id} className={`reminder-item reminder-item--${rem.tone}`}>
              <Bell size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <p className="reminder-title">{rem.title}</p>
                <p className="reminder-body">{rem.body}</p>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {/* 7-Day Interactive Strip */}
      <section className="card" aria-label="Recent 7 days">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <h3 className="section-title" style={{ margin: 0 }}>
            This Week
          </h3>
          <span className="section-caption">Tap any day to log</span>
        </div>
        <div className="week-strip">
          {weekDates.map((iso) => {
            const c = classifyDate(iso, data.logs, stats, data.settings, summary.today);
            const isToday = iso === summary.today;
            const cls = [
              'week-day-btn',
              isToday ? 'week-day-btn--today' : '',
              c.isLoggedPeriod ? 'week-day-btn--period' : '',
              c.isPredictedPeriod ? 'week-day-btn--predicted' : '',
              c.isOvulation ? 'week-day-btn--ovulation' : c.isFertile ? 'week-day-btn--fertile' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={iso}
                type="button"
                className={cls}
                onClick={() => onOpenLogDialog(iso)}
                aria-label={`${formatShortDate(iso)}${isToday ? ' (Today)' : ''}${c.isLoggedPeriod ? ', period logged' : ''}`}
              >
                <span className="week-day-letter">{formatWeekdayShort(iso)}</span>
                <span className="week-day-num tabular">{getDayOfMonth(iso)}</span>
                <span className="day-dot-row" aria-hidden="true">
                  {c.hasLogDetails ? <span className="day-dot" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Fertility / Ovulation Window Card (Cycle & TTC modes) */}
      {summary.mode !== 'pregnancy' && summary.ovulationDate && summary.fertileStartDate ? (
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 className="section-title" style={{ margin: 0 }}>
              Fertility &amp; Ovulation Window
            </h3>
            <span className="phase-badge phase-badge--fertile">
              {summary.mode === 'ttc' ? 'TTC Focus' : 'Estimated'}
            </span>
          </div>
          <div className="metrics-grid" style={{ marginTop: 10 }}>
            <div className="metric-tile">
              <div className="metric-label">Fertile Window</div>
              <div className="metric-value tabular" style={{ fontSize: '1.25rem' }}>
                {formatShortDate(summary.fertileStartDate)} –{' '}
                {formatShortDate(summary.fertileEndDate ?? summary.ovulationDate)}
              </div>
              <div className="metric-sub">6-day high-chance window</div>
            </div>
            <div className="metric-tile">
              <div className="metric-label">Peak Ovulation</div>
              <div className="metric-value tabular" style={{ fontSize: '1.25rem' }}>
                {formatShortDate(summary.ovulationDate)}
              </div>
              <div className="metric-sub">
                Luteal phase {data.settings.lutealLength}d
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Pregnancy Milestone Card */}
      {summary.mode === 'pregnancy' && summary.pregnancy ? (
        <section className="card">
          <h3 className="section-title">Week {summary.pregnancy.weeks} Milestone</h3>
          <p style={{ margin: '6px 0 0', fontSize: '0.92rem', color: 'var(--color-text-secondary)' }}>
            {summary.pregnancy.milestone}
          </p>
        </section>
      ) : null}

      {/* Today's Logged Snapshot */}
      {todayLog ? (
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 className="section-title" style={{ margin: 0 }}>
              Logged Today
            </h3>
            <button
              type="button"
              className="btn-secondary"
              style={{ minHeight: 36, padding: '6px 12px', fontSize: '0.8rem' }}
              onClick={() => onOpenLogDialog(summary.today)}
            >
              Edit
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {todayLog.flow !== 'none' ? (
              <span className="phase-badge phase-badge--menstrual">
                Flow: {FLOW_LABEL_MAP[todayLog.flow]}
              </span>
            ) : null}
            {todayLog.symptoms.map((s) => (
              <span key={s} className="phase-badge phase-badge--follicular">
                {SYMPTOM_LABEL_MAP[s]}
              </span>
            ))}
            {todayLog.moods.map((m) => (
              <span key={m} className="phase-badge phase-badge--fertile">
                {MOOD_LABEL_MAP[m]}
              </span>
            ))}
            {typeof todayLog.bbtC === 'number' ? (
              <span className="phase-badge phase-badge--ovulation tabular">
                BBT {formatTemp(todayLog.bbtC, data.settings.tempUnit)}
              </span>
            ) : null}
          </div>
          {todayLog.notes ? (
            <p style={{ margin: '10px 0 0', fontSize: '0.88rem', color: 'var(--color-text-secondary)' }}>
              {todayLog.notes}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Phase Guidance Card */}
      <section className="card-subtle">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Sun size={16} color="var(--color-brand-primary)" />
          <strong style={{ fontSize: '0.92rem' }}>{phaseInfo.title}</strong>
        </div>
        <p style={{ margin: '0 0 6px', fontSize: '0.86rem', color: 'var(--color-text-secondary)' }}>
          {phaseInfo.summary}
        </p>
        <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--color-text-primary)' }}>
          {phaseInfo.gentleCare}
        </p>
      </section>

      <p className="disclaimer-note">
        Predictions are estimates based on your personal logs and are not intended for medical diagnosis or contraception.
      </p>
    </>
  );
}
