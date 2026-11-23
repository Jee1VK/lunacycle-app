import { useState } from 'react';
import { Delete, Lock, ShieldCheck } from 'lucide-react';

interface PinLockScreenProps {
  disguiseMode: boolean;
  onUnlock: (pin: string) => Promise<boolean>;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function PinLockScreen({ disguiseMode, onUnlock }: PinLockScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const handleDigit = async (digit: string) => {
    if (verifying || pin.length >= 4) return;
    setError('');
    const next = pin + digit;
    setPin(next);

    if (next.length === 4) {
      setVerifying(true);
      const ok = await onUnlock(next);
      setVerifying(false);
      if (!ok) {
        setError('Incorrect PIN. Please try again.');
        setPin('');
      }
    }
  };

  const handleBackspace = () => {
    if (verifying) return;
    setError('');
    setPin((prev) => prev.slice(0, -1));
  };

  return (
    <main className="pin-screen">
      <div className="card pin-card">
        <div className="brand-mark" aria-hidden="true">
          <Lock size={18} />
        </div>
        <div>
          <h1 className="brand-title">{disguiseMode ? 'Daily Notes' : 'LunaCycle'}</h1>
          <p className="section-caption">
            {disguiseMode ? 'Enter your 4-digit passcode' : 'Enter your 4-digit private PIN'}
          </p>
        </div>

        <div className="pin-dots" role="status" aria-label={`${pin.length} of 4 digits entered`}>
          {[0, 1, 2, 3].map((idx) => (
            <span
              key={idx}
              className={`pin-dot ${idx < pin.length ? 'pin-dot--filled' : ''}`}
            />
          ))}
        </div>

        {error ? (
          <p role="alert" style={{ margin: 0, color: 'var(--color-feedback-error)', fontSize: '0.84rem' }}>
            {error}
          </p>
        ) : (
          <p style={{ margin: 0, minHeight: '1.25rem', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
            {verifying ? 'Unlocking local vault...' : 'AES-GCM encrypted on-device'}
          </p>
        )}

        <div className="pin-keypad">
          {DIGITS.map((d) => (
            <button
              key={d}
              type="button"
              className="pin-key tabular"
              onClick={() => handleDigit(d)}
              disabled={verifying}
            >
              {d}
            </button>
          ))}
          <div aria-hidden="true" />
          <button
            type="button"
            className="pin-key tabular"
            onClick={() => handleDigit('0')}
            disabled={verifying}
          >
            0
          </button>
          <button
            type="button"
            className="pin-key"
            onClick={handleBackspace}
            aria-label="Delete last digit"
            disabled={verifying || pin.length === 0}
          >
            <Delete size={20} />
          </button>
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
          <ShieldCheck size={14} />
          <span>Zero cloud sync · Stored strictly on this device</span>
        </div>
      </div>
    </main>
  );
}
