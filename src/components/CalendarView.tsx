import { useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Edit3,
  Plus,
} from 'lucide-react';
import {
  FLOW_LABEL_MAP,
  MOOD_LABEL_MAP,
  PHASE_INFO,
  SYMPTOM_LABEL_MAP,
} from '../engine/catalog';
import { classifyDate, formatTemp } from '../engine/cycleEngine';
import {
  formatLongDate,
  getDayOfMonth,
  getMonthCalendarDays,
  getYearMonth,
  shiftYearMonth,
} from '../engine/temporal';
import type { CycleStats, LunaData } from '../types';

interface CalendarViewProps {
  data: LunaData;
  stats: CycleStats;
  today: string;
  initialEditPeriodsMode?: boolean;
  onTogglePeriodDate: (date: string) => void;
  onOpenLogDialog: (date: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarView({
  data,
  stats,
  today,
  initialEditPeriodsMode = false,
  onTogglePeriodDate,
  onOpenLogDialog,
}: CalendarViewProps) {
  const initialYm = getYearMonth(today);
  const [viewYm, setViewYm] = useState(initialYm);
  const [selectedDate, setSelectedDate] = useState(today);
  const [editPeriodsMode, setEditPeriodsMode] = useState(initialEditPeriodsMode);

  const { leadingEmpty, days, monthLabel } = getMonthCalendarDays(viewYm.year, viewYm.month);
  const selectedClass = classifyDate(selectedDate, data.logs, stats, data.settings, today);
  const selectedLog = data.logs[selectedDate];

  const handleDayClick = (iso: string) => {
    setSelectedDate(iso);
    if (editPeriodsMode) {
      onTogglePeriodDate(iso);
    }
  };

  return (
    <>
      <section className="card" aria-label="Cycle calendar">
        <div className="cal-header">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setViewYm((ym) => shiftYearMonth(ym.year, ym.month, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft size={20} />
          </button>
          <div style={{ textAlign: 'center' }}>
            <h2 className="cal-month-title">{monthLabel}</h2>
            <button
              type="button"
              onClick={() => {
                setViewYm(getYearMonth(today));
                setSelectedDate(today);
              }}
              style={{
                border: 'none',
                background: 'none',
                color: 'var(--color-brand-primary)',
                fontSize: '0.78rem',
                fontWeight: 600,
                padding: '2px 8px',
              }}
            >
              Jump to Today
            </button>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setViewYm((ym) => shiftYearMonth(ym.year, ym.month, 1))}
            aria-label="Next month"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Fast Batch Edit Period Days Toggle (Flo-style) */}
        <div style={{ marginBottom: 14 }}>
          <button
            type="button"
            className={editPeriodsMode ? 'btn-primary' : 'btn-secondary'}
            style={{ width: '100%' }}
            aria-pressed={editPeriodsMode}
            onClick={() => setEditPeriodsMode((v) => !v)}
          >
            {editPeriodsMode ? <Check size={17} /> : <Droplets size={17} />}
            {editPeriodsMode
              ? 'Done Editing Period Days (Tap dates to mark)'
              : 'Quick-Edit Period Days'}
          </button>
        </div>

        <div className="cal-weekdays" aria-hidden="true">
          {WEEKDAYS.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>

        <div className="cal-grid" role="grid" aria-label={monthLabel}>
          {Array.from({ length: leadingEmpty }).map((_, i) => (
            <div key={`empty-${i}`} aria-hidden="true" />
          ))}
          {days.map((iso) => {
            const c = classifyDate(iso, data.logs, stats, data.settings, today);
            const isToday = iso === today;
            const isSelected = iso === selectedDate;
            const cellClass = [
              'cal-cell',
              isSelected ? 'cal-cell--selected' : '',
              isToday ? 'cal-cell--today' : '',
              c.isLoggedPeriod ? 'cal-cell--period' : '',
              c.isPredictedPeriod ? 'cal-cell--predicted' : '',
              c.isOvulation ? 'cal-cell--ovulation' : c.isFertile ? 'cal-cell--fertile' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={iso}
                type="button"
                className={cellClass}
                onClick={() => handleDayClick(iso)}
                aria-label={`${formatLongDate(iso)}, ${PHASE_INFO[c.phase].shortLabel}${c.hasLogDetails ? ', has logged details' : ''}`}
                aria-pressed={editPeriodsMode ? c.isLoggedPeriod : isSelected}
              >
                <span className="cal-cell-num tabular">{getDayOfMonth(iso)}</span>
                <span className="day-dot-row" aria-hidden="true">
                  {c.hasLogDetails ? <span className="day-dot" /> : null}
                </span>
              </button>
            );
          })}
        </div>

        {/* Multi-Cue Accessible Legend */}
        <div className="cal-legend">
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: 'var(--color-brand-primary)' }} />
            Logged period
          </span>
          <span className="legend-item">
            <span
              className="legend-swatch"
              style={{
                background: 'var(--color-brand-primary-soft)',
                border: '1.5px dashed var(--color-brand-primary-mid)',
              }}
            />
            Predicted period
          </span>
          <span className="legend-item">
            <span
              className="legend-swatch"
              style={{
                background: 'var(--color-brand-secondary-soft)',
                border: '1px solid var(--color-brand-secondary)',
              }}
            />
            Fertile window
          </span>
          <span className="legend-item">
            <span
              className="legend-swatch"
              style={{
                background: 'var(--color-brand-accent-soft)',
                border: '1.5px solid var(--color-brand-accent)',
              }}
            />
            Ovulation
          </span>
          <span className="legend-item">
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 9999,
                background: 'var(--color-text-primary)',
                display: 'inline-block',
                margin: '0 4px',
              }}
            />
            Logged notes/symptoms
          </span>
        </div>
      </section>

      {/* Selected Day Detail Card */}
      <section className="card" aria-label="Selected day details">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <h3 className="section-title">{formatLongDate(selectedDate)}</h3>
            <p className="section-caption">
              {PHASE_INFO[selectedClass.phase].title}
              {selectedClass.cycleDay ? ` · Cycle Day ${selectedClass.cycleDay}` : ''}
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ minHeight: 44, padding: '8px 14px', fontSize: '0.86rem' }}
            onClick={() => onOpenLogDialog(selectedDate)}
          >
            {selectedLog ? <Edit3 size={15} /> : <Plus size={15} />}
            {selectedLog ? 'Edit Log' : 'Log Day'}
          </button>
        </div>

        {selectedLog ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selectedLog.flow !== 'none' ? (
                <span className="phase-badge phase-badge--menstrual">
                  Flow: {FLOW_LABEL_MAP[selectedLog.flow]}
                </span>
              ) : null}
              {selectedLog.lhTest !== 'none' ? (
                <span className="phase-badge phase-badge--ovulation">
                  LH: {selectedLog.lhTest}
                </span>
              ) : null}
              {selectedLog.mucus !== 'none' ? (
                <span className="phase-badge phase-badge--fertile">
                  Mucus: {selectedLog.mucus.replace('_', ' ')}
                </span>
              ) : null}
              {typeof selectedLog.bbtC === 'number' ? (
                <span className="phase-badge phase-badge--follicular tabular">
                  BBT: {formatTemp(selectedLog.bbtC, data.settings.tempUnit)}
                </span>
              ) : null}
              {selectedLog.symptoms.map((s) => (
                <span key={s} className="phase-badge phase-badge--follicular">
                  {SYMPTOM_LABEL_MAP[s]}
                </span>
              ))}
              {selectedLog.moods.map((m) => (
                <span key={m} className="phase-badge phase-badge--fertile">
                  {MOOD_LABEL_MAP[m]}
                </span>
              ))}
            </div>
            {selectedLog.notes ? (
              <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--color-text-secondary)' }}>
                {selectedLog.notes}
              </p>
            ) : null}
          </div>
        ) : (
          <p style={{ margin: '12px 0 0', fontSize: '0.86rem', color: 'var(--color-text-muted)' }}>
            No symptoms, mood, or notes logged for this date yet.
          </p>
        )}
      </section>
    </>
  );
}
