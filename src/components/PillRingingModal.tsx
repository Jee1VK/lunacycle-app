import { useEffect, useRef } from 'react';
import { BellRing, CheckCircle2, Clock, X } from 'lucide-react';

export interface ActivePillRing {
  key: string;
  scheduledTime: string;
  dayInPack: number;
  totalPills: number;
  pillsPerDay: number;
  pillsRemaining: number;
  needsRefill: boolean;
  isTest?: boolean;
}

interface PillRingingModalProps {
  ring: ActivePillRing | null;
  onMarkTaken: () => void;
  onSnooze: (minutes: number) => void;
  onDismiss: () => void;
}

export function PillRingingModal({
  ring,
  onMarkTaken,
  onSnooze,
  onDismiss,
}: PillRingingModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (ring && !dialog.open) {
      dialog.showModal();
    } else if (!ring && dialog.open) {
      dialog.close();
    }
  }, [ring]);

  return (
    <dialog
      ref={dialogRef}
      className="ring-dialog"
      aria-labelledby="pill-ring-title"
      onCancel={(e) => {
        e.preventDefault();
      }}
    >
      {ring ? (
        <div className="ring-dialog__inner">
          <div className="ring-pulse" aria-hidden="true">
            <BellRing size={34} />
          </div>

          <div>
            <span className="ring-badge">
              {ring.isTest ? 'Test Pill Alarm' : 'Daily Pill Alarm'}
            </span>
            <h2 id="pill-ring-title" className="ring-title">
              Time for Your Pill
            </h2>
            <p className="ring-subtitle tabular">
              {ring.pillsPerDay === 1 ? '1 pill' : `${ring.pillsPerDay} pills`} · Scheduled{' '}
              {ring.scheduledTime}
            </p>
          </div>

          <div className="ring-info-box">
            {ring.dayInPack > 0 ? (
              <div>
                <strong>Pack Day {ring.dayInPack}</strong> of {ring.totalPills} ·{' '}
                {ring.pillsRemaining} {ring.pillsRemaining === 1 ? 'pill' : 'pills'} left
              </div>
            ) : (
              <div>Scheduled pill pack reminder</div>
            )}
            {ring.needsRefill ? (
              <div style={{ marginTop: 4, color: '#FDE68A', fontWeight: 600 }}>
                Refill soon — running low on pills!
              </div>
            ) : null}
          </div>

          <div className="ring-actions">
            <button
              type="button"
              className="ring-btn-take"
              autoFocus
              onClick={onMarkTaken}
            >
              <CheckCircle2 size={20} aria-hidden="true" />
              {ring.isTest ? 'Stop Test Alarm' : 'Mark Taken'}
            </button>

            {!ring.isTest ? (
              <>
                <div className="ring-btn-snooze-row">
                  <button
                    type="button"
                    className="ring-btn-ghost"
                    onClick={() => onSnooze(5)}
                  >
                    <Clock size={15} aria-hidden="true" />
                    Snooze 5m
                  </button>
                  <button
                    type="button"
                    className="ring-btn-ghost"
                    onClick={() => onSnooze(10)}
                  >
                    <Clock size={15} aria-hidden="true" />
                    Snooze 10m
                  </button>
                </div>
                <button
                  type="button"
                  className="ring-btn-ghost"
                  onClick={onDismiss}
                >
                  <X size={15} aria-hidden="true" />
                  Dismiss
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
