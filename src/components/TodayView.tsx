import { useEffect, useState } from 'react';
import {
  Baby,
  Bell,
  CalendarPlus,
  Check,
  Clock,
  Droplets,
  Heart,
  HelpCircle,
  Pill,
  Plus,
  Sparkles,
  Square,
  Sun,
  X,
} from 'lucide-react';
import {
  FLOW_LABEL_MAP,
  MOOD_LABEL_MAP,
  PHASE_INFO,
  SYMPTOM_LABEL_MAP,
} from '../engine/catalog';
import {
  classifyDate,
  computePersonalSymptomForecast,
  formatTemp,
} from '../engine/cycleEngine';
import {
  computePillPackStatus,
  getHygieneTimerRemaining,
  getPillReminderTimes,
  SANITARY_PRODUCTS,
} from '../engine/hygieneTimer';
import { getUiStrings } from '../engine/i18n';
import {
  PHYSICIAN_CONSULTATION_NOTICE,
  WELLNESS_MEDICAL_DISCLAIMER,
} from '../engine/medicalSources';
import type { ActiveReminder } from '../engine/reminders';
import {
  addDays,
  formatShortDate,
  formatWeekdayShort,
  getDayOfMonth,
} from '../engine/temporal';
import type {
  CycleStats,
  LunaData,
  PartnerCarePing,
  SanitaryProductType,
  TodaySummary,
} from '../types';
import { ModalDialog } from './ModalDialog';

interface TodayViewProps {
  data: LunaData;
  stats: CycleStats;
  summary: TodaySummary;
  reminders: ActiveReminder[];
  incomingCarePing: PartnerCarePing | null;
  partnerSharingEnabled: boolean;
  onDismissCarePing: () => void;
  onReactToCarePing: (pingId: string, reaction: string) => void;
  onSendPrimaryCareRequest: (message: string) => void;
  onQuickTogglePeriodToday: () => void;
  onOpenLogDialog: (date: string) => void;
  onLoadSampleData: () => void;
  onJumpToCalendarEdit: () => void;
  onStartHygieneTimer: (product: SanitaryProductType) => void;
  onLogHygieneChange: (restart: boolean) => void;
  onStopHygieneTimer: () => void;
  onTogglePillDate: (date: string) => void;
  onMarkPillLate: (date: string) => void;
  onStartNewPillPack: () => void;
}

export function TodayView({
  data,
  stats,
  summary,
  reminders,
  incomingCarePing,
  partnerSharingEnabled,
  onDismissCarePing,
  onReactToCarePing,
  onSendPrimaryCareRequest,
  onQuickTogglePeriodToday,
  onOpenLogDialog,
  onLoadSampleData,
  onJumpToCalendarEdit,
  onStartHygieneTimer,
  onLogHygieneChange,
  onStopHygieneTimer,
  onTogglePillDate,
  onMarkPillLate,
  onStartNewPillPack,
}: TodayViewProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showMissedPillGuide, setShowMissedPillGuide] = useState(false);
  const [sendingCareAction, setSendingCareAction] = useState(false);
  const activeTimer = data.settings.activeHygieneTimer;

  useEffect(() => {
    if (!activeTimer) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeTimer]);

  const timerState = activeTimer ? getHygieneTimerRemaining(activeTimer, nowMs) : null;
  const latestPeriodStart =
    stats.periods.length > 0 ? stats.periods[stats.periods.length - 1].startDate : null;
  const pillStatus =
    data.settings.pillPack.enabled && !data.settings.simpleMode
      ? computePillPackStatus(data.settings.pillPack, summary.today, latestPeriodStart)
      : null;
  const pillReminderTimes = getPillReminderTimes(data.settings.pillPack);
  const t = getUiStrings(data.settings.language);
  const phaseInfo = PHASE_INFO[summary.phase];
  const personalForecast = computePersonalSymptomForecast(data.logs, stats, summary);
  const todayLog = data.logs[summary.today];
  const todayEstMl = (todayLog?.hygieneChanges ?? []).reduce((s, h) => s + h.estimatedMl, 0);

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
                {/* Fertile Window Segment (hidden in Birth Control / Simple Mode) */}
                {!data.settings.birthControlMode && !data.settings.simpleMode ? (
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
                ) : null}
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
              {summary.isPeriodActiveToday ? t.removePeriodToday : t.logPeriodToday}
            </button>
          ) : null}
          <button
            type="button"
            className={summary.mode === 'pregnancy' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => onOpenLogDialog(summary.today)}
          >
            <Plus size={18} />
            {t.logSymptomsNotes}
          </button>
        </div>

        {/* First-time Onboarding Shortcuts + Physician Consultation Notice */}
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
            <p className="field-hint" style={{ marginTop: 10, marginBottom: 0 }}>
              <strong>Medical Notice:</strong> {WELLNESS_MEDICAL_DISCLAIMER} {PHYSICIAN_CONSULTATION_NOTICE}
            </p>
          </div>
        ) : null}
      </section>

      {/* Incoming Encrypted Partner Care Ping with 1-Tap Reactions */}
      {incomingCarePing ? (
        <section
          className="card"
          aria-label="Message from partner"
          style={{
            borderColor: 'var(--color-brand-accent)',
            background: 'var(--color-brand-accent-soft)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Heart size={18} color="var(--color-brand-primary)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <p style={{ margin: 0, fontSize: '0.76rem', fontWeight: 700, color: 'var(--color-brand-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {incomingCarePing.kind === 'hug'
                    ? `Warm Hug from ${incomingCarePing.senderLabel}`
                    : `Care Ping from ${incomingCarePing.senderLabel}`}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '0.92rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {incomingCarePing.message}
                </p>
                {incomingCarePing.reaction ? (
                  <p style={{ margin: '4px 0 0', fontSize: '0.76rem', fontWeight: 600, color: 'var(--color-brand-secondary)' }}>
                    You reacted: {incomingCarePing.reaction}
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              className="icon-btn"
              style={{ minWidth: 36, minHeight: 36 }}
              aria-label="Dismiss partner note"
              onClick={onDismissCarePing}
            >
              <X size={16} />
            </button>
          </div>
          <div className="chip-group" style={{ marginTop: 10 }}>
            {['❤️ Love this', '☕ Yes please!', '🤗 Need a hug', '🙏 Thank you', '💤 Resting'].map((rx) => (
              <button
                key={rx}
                type="button"
                className="chip"
                disabled={sendingCareAction}
                aria-pressed={incomingCarePing.reaction === rx}
                style={{ minHeight: 34, padding: '4px 10px', fontSize: '0.76rem' }}
                onClick={() => {
                  setSendingCareAction(true);
                  onReactToCarePing(incomingCarePing.id, rx);
                  window.setTimeout(() => setSendingCareAction(false), 1500);
                }}
              >
                {rx}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Reverse 1-Tap "Ask Partner" Care Request Strip (when Partner Sharing is active) */}
      {partnerSharingEnabled ? (
        <section className="card-subtle" aria-label="Quick care requests to partner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Heart size={14} color="var(--color-brand-primary)" />
            <strong style={{ fontSize: '0.82rem' }}>Send Partner a Quick Request</strong>
          </div>
          <div className="chip-group">
            {[
              'Could use warm tea / coffee',
              'Can you handle dinner tonight?',
              'Need a hug when you’re back',
              'Please pick up pads / meds',
            ].map((req) => (
              <button
                key={req}
                type="button"
                className="chip"
                disabled={sendingCareAction}
                style={{ minHeight: 34, padding: '5px 10px', fontSize: '0.76rem' }}
                onClick={() => {
                  setSendingCareAction(true);
                  onSendPrimaryCareRequest(req);
                  window.setTimeout(() => setSendingCareAction(false), 1500);
                }}
              >
                {req}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Predictive Personal Symptom Heads-Up */}
      {personalForecast ? (
        <section className="reminder-item reminder-item--gentle" aria-label="Personal symptom forecast">
          <Sparkles size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <p className="reminder-title">{personalForecast.headline}</p>
            <p className="reminder-body" style={{ marginBottom: 6 }}>
              {personalForecast.body}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {personalForecast.symptoms.map((s) => (
                <span key={s} className="phase-badge phase-badge--ovulation" style={{ fontSize: '0.72rem' }}>
                  {SYMPTOM_LABEL_MAP[s]}
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : null}

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

      {/* Sanitary Product Hygiene Timer (shown during active period or when a timer is running) */}
      {summary.isPeriodActiveToday || activeTimer ? (
        <section className="card" aria-label="Sanitary product hygiene timer">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={18} color="var(--color-brand-primary)" />
              <h3 className="section-title" style={{ margin: 0 }}>
                Hygiene Timer
              </h3>
            </div>
            {todayEstMl > 0 ? (
              <span className="phase-badge phase-badge--menstrual tabular">
                ~{todayEstMl} mL today
              </span>
            ) : null}
          </div>

          {activeTimer && timerState ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, textTransform: 'capitalize' }}>
                  {activeTimer.product} ({activeTimer.durationHours}h timer)
                </span>
                <span
                  className="tabular"
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: timerState.isDue ? 'var(--color-feedback-error)' : 'var(--color-brand-primary)',
                  }}
                >
                  {timerState.formatted}
                </span>
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 9999,
                  background: 'var(--color-surface-elevated)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${timerState.progressPercent}%`,
                    background: timerState.isDue
                      ? 'var(--color-feedback-error)'
                      : 'var(--color-brand-primary)',
                    transition: 'width 300ms ease',
                  }}
                />
              </div>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => onLogHygieneChange(true)}
                >
                  <Check size={16} />
                  Changed · Restart
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onStopHygieneTimer}
                >
                  <Square size={14} />
                  Stop
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="section-caption" style={{ marginBottom: 10 }}>
                Start a discreet change reminder and track estimated flow volume:
              </p>
              <div className="chip-group">
                {SANITARY_PRODUCTS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="chip"
                    onClick={() => onStartHygieneTimer(p.id)}
                  >
                    {p.label} ({p.defaultHours}h)
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : null}

      {/* Daily Pill Pack Widget (shown when enabled in Settings) */}
      {pillStatus ? (
        <section className="card" aria-label="Daily pill pack tracker">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Pill size={18} color="var(--color-brand-secondary)" style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <h3 className="section-title" style={{ margin: 0 }}>
                  {pillStatus.startsInDays > 0
                    ? `Pill Pack · Starts in ${pillStatus.startsInDays}d`
                    : `Pill Pack · Day ${pillStatus.dayInPack}/${pillStatus.totalPills}`}
                </h3>
                <p className="section-caption">
                  {pillStatus.startsInDays > 0
                    ? `Starts ${formatShortDate(pillStatus.effectiveStartDate)}${pillStatus.periodLinked ? ` (Period Day ${data.settings.pillPack.startPeriodDay ?? 2})` : ''}`
                    : `${pillStatus.isBreakDay ? 'Placebo / break' : `${pillStatus.pillsPerDay} ${pillStatus.pillsPerDay === 1 ? 'pill' : 'pills'}/day`} · ${pillStatus.streak}-day streak`}
                </p>
              </div>
            </div>
            {pillStatus.startsInDays === 0 ? (
              <button
                type="button"
                className={pillStatus.takenToday ? 'btn-secondary' : 'btn-primary'}
                style={{ minHeight: 42, padding: '8px 14px', fontSize: '0.84rem', flexShrink: 0 }}
                onClick={() => onTogglePillDate(summary.today)}
              >
                <Check size={15} />
                {pillStatus.takenToday ? 'Taken' : 'Mark Taken'}
              </button>
            ) : null}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            <span className="phase-badge phase-badge--follicular tabular" style={{ fontSize: '0.72rem' }}>
              <Bell size={12} />
              {(data.settings.pillPack.alarmEnabled ?? true)
                ? `${pillReminderTimes.length === 1 ? 'Alarm' : `${pillReminderTimes.length} Alarms`} ${pillReminderTimes.join(' · ')}`
                : 'Alarm off'}
            </span>
            <span
              className={`phase-badge tabular ${pillStatus.needsRefill ? 'phase-badge--menstrual' : 'phase-badge--fertile'}`}
              style={{ fontSize: '0.72rem' }}
            >
              {pillStatus.pillsRemaining} {pillStatus.pillsRemaining === 1 ? 'pill' : 'pills'} left
            </span>
            {pillStatus.periodLinked ? (
              <span className="phase-badge phase-badge--ovulation" style={{ fontSize: '0.72rem' }}>
                Period Day {data.settings.pillPack.startPeriodDay ?? 2} start
              </span>
            ) : null}
            <button
              type="button"
              className="phase-badge phase-badge--follicular"
              style={{
                fontSize: '0.72rem',
                border: '1px solid var(--color-border-subtle)',
                cursor: 'pointer',
              }}
              onClick={() => setShowMissedPillGuide(true)}
            >
              <HelpCircle size={12} />
              Missed a pill?
            </button>
          </div>

          {pillStatus.needsRefill ? (
            <div
              className="reminder-item reminder-item--period"
              style={{ marginBottom: 10, alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
            >
              <div>
                <p className="reminder-title">Time to refill your pack</p>
                <p className="reminder-body">
                  {pillStatus.pillsRemaining} {pillStatus.pillsRemaining === 1 ? 'pill' : 'pills'} ({pillStatus.daysRemainingInPack} {pillStatus.daysRemainingInPack === 1 ? 'day' : 'days'}) remaining.
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ minHeight: 38, padding: '6px 10px', fontSize: '0.78rem', flexShrink: 0 }}
                onClick={onStartNewPillPack}
              >
                New Pack
              </button>
            </div>
          ) : null}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 5,
              maxHeight: pillStatus.totalPills > 35 ? 210 : undefined,
              overflowY: pillStatus.totalPills > 35 ? 'auto' : undefined,
            }}
          >
            {pillStatus.packDates.map((d) => (
              <button
                key={d.date}
                type="button"
                onClick={() => onTogglePillDate(d.date)}
                aria-label={`Pack day ${d.dayNumber}${d.takenLate ? ', taken late' : d.taken ? ', taken' : ''}`}
                style={{
                  minHeight: 34,
                  borderRadius: 8,
                  border: d.isToday
                    ? '2px solid var(--color-brand-accent)'
                    : '1px solid var(--color-border-subtle)',
                  background: d.takenLate
                    ? 'var(--color-brand-accent)'
                    : d.taken
                      ? 'var(--color-brand-secondary)'
                      : d.isBreak
                        ? 'var(--color-surface-elevated)'
                        : 'var(--color-surface-card)',
                  color: d.takenLate
                    ? '#1C1917'
                    : d.taken
                      ? '#FFFFFF'
                      : 'var(--color-text-secondary)',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                }}
                className="tabular"
              >
                {d.dayNumber}
              </button>
            ))}
          </div>
          <p className="field-hint" style={{ marginTop: 8, marginBottom: 0 }}>
            {WELLNESS_MEDICAL_DISCLAIMER}
          </p>
        </section>
      ) : null}

      {/* 7-Day Interactive Strip */}
      <section className="card" aria-label="Recent 7 days">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <h3 className="section-title" style={{ margin: 0 }}>
            {t.thisWeek}
          </h3>
          <span className="section-caption">{t.tapAnyDay}</span>
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

      {/* Fertility / Ovulation Window Card (Cycle & TTC modes; hidden in Birth Control / Simple Mode) */}
      {summary.mode !== 'pregnancy' &&
      !data.settings.birthControlMode &&
      !data.settings.simpleMode &&
      summary.ovulationDate &&
      summary.fertileStartDate ? (
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
              <div className="metric-sub">7-day fertile window</div>
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
            {(todayLog.customSymptoms ?? []).map((s) => (
              <span key={`cs-${s}`} className="phase-badge phase-badge--follicular">
                {s}
              </span>
            ))}
            {todayLog.moods.map((m) => (
              <span key={m} className="phase-badge phase-badge--fertile">
                {MOOD_LABEL_MAP[m]}
              </span>
            ))}
            {(todayLog.customMoods ?? []).map((m) => (
              <span key={`cm-${m}`} className="phase-badge phase-badge--fertile">
                {m}
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
        {WELLNESS_MEDICAL_DISCLAIMER} {PHYSICIAN_CONSULTATION_NOTICE} Clinical references (ACOG, WHO, NIH, Mayo Clinic) are available in Settings.
      </p>

      <ModalDialog
        open={showMissedPillGuide}
        title="Missed or Late Pill Log"
        onClose={() => setShowMissedPillGuide(false)}
        footer={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowMissedPillGuide(false)}
          >
            Got It
          </button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '0.88rem' }}>
          <div className="card-subtle">
            <strong style={{ display: 'block', marginBottom: 4 }}>Follow Your Prescription Leaflet</strong>
            <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
              Missed-dose instructions vary by medication type and brand. Always check the official package insert that came with your pack or contact your doctor or pharmacist promptly for guidance.
            </p>
          </div>
          <div className="card-subtle">
            <strong style={{ display: 'block', marginBottom: 4 }}>Keep Your Personal Log Accurate</strong>
            <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
              If you took a pill later than your scheduled alarm time, you can record it as taken late below so your personal history stays accurate for clinician visits.
            </p>
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                onMarkPillLate(summary.today);
                setShowMissedPillGuide(false);
              }}
            >
              Mark Today Taken Late
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                onMarkPillLate(addDays(summary.today, -1));
                setShowMissedPillGuide(false);
              }}
            >
              Mark Yesterday Taken Late
            </button>
          </div>
          <p className="field-hint">
            For personal self-tracking only — LunaCycle does not provide medical advice, dosing instructions, or contraceptive guidance.
          </p>
        </div>
      </ModalDialog>
    </>
  );
}
