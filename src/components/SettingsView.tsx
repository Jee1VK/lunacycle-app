import { useRef, useState, type ChangeEvent } from 'react';
import {
  Bell,
  Download,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Lock,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
} from 'lucide-react';
import { addDays } from '../engine/temporal';
import {
  getNotificationSupport,
  requestNotificationPermission,
} from '../engine/reminders';
import type { LunaData, PinLockConfig, TrackingMode, UserSettings } from '../types';
import { ModalDialog } from './ModalDialog';

interface SettingsViewProps {
  data: LunaData;
  pinConfig: PinLockConfig | null;
  today: string;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
  onSetPin: (pin: string) => Promise<void>;
  onRemovePin: () => Promise<void>;
  onExportJson: (passphrase?: string) => Promise<void>;
  onImportJsonText: (fileText: string, passphrase?: string) => Promise<'ok' | 'needs_passphrase' | 'error'>;
  onExportCsv: () => void;
  onExportDoctorPdf: () => void;
  onLoadSampleData: () => void;
  onEraseAllData: () => Promise<void>;
  onNotify: (msg: string) => void;
}

export function SettingsView({
  data,
  pinConfig,
  today,
  onUpdateSettings,
  onSetPin,
  onRemovePin,
  onExportJson,
  onImportJsonText,
  onExportCsv,
  onExportDoctorPdf,
  onLoadSampleData,
  onEraseAllData,
  onNotify,
}: SettingsViewProps) {
  const { settings } = data;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dialog states
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');

  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState('');

  const [importPassDialogOpen, setImportPassDialogOpen] = useState(false);
  const [pendingImportText, setPendingImportText] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');

  const [eraseDialogOpen, setEraseDialogOpen] = useState(false);

  const [notifStatus, setNotifStatus] = useState(() => getNotificationSupport());

  const handleModeChange = (mode: TrackingMode) => {
    const patch: Partial<UserSettings> = { mode };
    if (mode === 'pregnancy' && !settings.pregnancyLmpDate && !settings.pregnancyDueDate) {
      // Pre-fill sensible default LMP (8 weeks ago) if none set
      const defaultLmp = addDays(today, -56);
      patch.pregnancyLmpDate = defaultLmp;
      patch.pregnancyDueDate = addDays(defaultLmp, 280);
    }
    onUpdateSettings(patch);
  };

  const handleSavePin = async () => {
    if (!/^\d{4}$/.test(pinInput)) {
      setPinError('Please enter exactly 4 digits.');
      return;
    }
    if (pinInput !== pinConfirm) {
      setPinError('PIN entries do not match.');
      return;
    }
    await onSetPin(pinInput);
    setPinInput('');
    setPinConfirm('');
    setPinError('');
    setPinDialogOpen(false);
  };

  const handleImportFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const res = await onImportJsonText(text);
    if (res === 'needs_passphrase') {
      setPendingImportText(text);
      setImportPassphrase('');
      setImportPassDialogOpen(true);
    }
  };

  const handleEnableNotifications = async () => {
    const perm = await requestNotificationPermission();
    setNotifStatus(perm);
    if (perm === 'granted') {
      onNotify('Browser notifications enabled.');
    } else if (perm === 'denied') {
      onNotify('Notifications blocked by browser settings. In-app reminders remain active.');
    }
  };

  return (
    <>
      {/* Tracking Mode */}
      <section className="card">
        <h2 className="section-title">Tracking Mode</h2>
        <p className="section-caption" style={{ marginBottom: 12 }}>
          Switch smoothly between everyday cycle tracking, fertility focus, or pregnancy
        </p>

        <div className="segmented" role="group" aria-label="Tracking mode">
          {(
            [
              { id: 'cycle', label: 'Track Cycle' },
              { id: 'ttc', label: 'Trying (TTC)' },
              { id: 'pregnancy', label: 'Pregnancy' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              className="segmented-btn"
              aria-pressed={settings.mode === item.id}
              onClick={() => handleModeChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {settings.mode === 'pregnancy' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
            <label className="field-group">
              <span className="field-label">Last Period Start (LMP)</span>
              <input
                type="date"
                className="input-control tabular"
                value={settings.pregnancyLmpDate ?? ''}
                onChange={(e) => {
                  const val = e.target.value || null;
                  onUpdateSettings({
                    pregnancyLmpDate: val,
                    pregnancyDueDate: val ? addDays(val, 280) : settings.pregnancyDueDate,
                  });
                }}
              />
            </label>
            <label className="field-group">
              <span className="field-label">Estimated Due Date</span>
              <input
                type="date"
                className="input-control tabular"
                value={settings.pregnancyDueDate ?? ''}
                onChange={(e) => {
                  const val = e.target.value || null;
                  onUpdateSettings({
                    pregnancyDueDate: val,
                    pregnancyLmpDate: val ? addDays(val, -280) : settings.pregnancyLmpDate,
                  });
                }}
              />
            </label>
          </div>
        ) : null}
      </section>

      {/* Cycle Baselines */}
      <section className="card">
        <h2 className="section-title">Cycle Defaults &amp; Units</h2>
        <p className="section-caption" style={{ marginBottom: 12 }}>
          Used before 2+ cycles are logged; predictions adapt automatically from your history
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <label className="field-group">
            <span className="field-label">Cycle (days)</span>
            <input
              type="number"
              min={21}
              max={45}
              className="input-control tabular"
              value={settings.defaultCycleLength}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 21 && n <= 45) onUpdateSettings({ defaultCycleLength: n });
              }}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Period (days)</span>
            <input
              type="number"
              min={2}
              max={10}
              className="input-control tabular"
              value={settings.defaultPeriodLength}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 2 && n <= 10) onUpdateSettings({ defaultPeriodLength: n });
              }}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Luteal (days)</span>
            <input
              type="number"
              min={10}
              max={18}
              className="input-control tabular"
              value={settings.lutealLength}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 10 && n <= 18) onUpdateSettings({ lutealLength: n });
              }}
            />
          </label>
        </div>

        <div className="setting-row" style={{ marginTop: 10 }}>
          <div className="setting-label-wrap">
            <span className="setting-title">BBT Temperature Unit</span>
            <span className="setting-desc">Switch between Celsius and Fahrenheit</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['C', 'F'] as const).map((unit) => (
              <button
                key={unit}
                type="button"
                className="chip"
                aria-pressed={settings.tempUnit === unit}
                onClick={() => onUpdateSettings({ tempUnit: unit })}
              >
                °{unit}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy & Security Vault */}
      <section className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <ShieldCheck size={19} color="var(--color-brand-secondary)" />
          <h2 className="section-title" style={{ margin: 0 }}>
            Privacy &amp; Security Vault
          </h2>
        </div>
        <p className="section-caption" style={{ marginBottom: 14 }}>
          100% local IndexedDB storage. Zero accounts, zero analytics, zero third-party requests.
        </p>

        <div className="setting-row">
          <div className="setting-label-wrap">
            <span className="setting-title">4-Digit PIN &amp; At-Rest Encryption</span>
            <span className="setting-desc">
              {pinConfig?.enabled
                ? 'Active — vault is AES-GCM encrypted and locked on reopen'
                : 'Protect logs with a 4-digit PIN and Web Crypto AES-GCM'}
            </span>
          </div>
          {pinConfig?.enabled ? (
            <button type="button" className="btn-secondary" onClick={onRemovePin}>
              <Unlock size={16} />
              Disable
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setPinError('');
                setPinInput('');
                setPinConfirm('');
                setPinDialogOpen(true);
              }}
            >
              <Lock size={16} />
              Set PIN
            </button>
          )}
        </div>

        <label className="setting-row" htmlFor="disguise-switch">
          <div className="setting-label-wrap">
            <span className="setting-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <EyeOff size={15} />
              Disguise Mode
            </span>
            <span className="setting-desc">
              Shows neutral &ldquo;Daily Notes&rdquo; title and discreet notification text
            </span>
          </div>
          <input
            id="disguise-switch"
            type="checkbox"
            checked={settings.disguiseMode}
            onChange={(e) => onUpdateSettings({ disguiseMode: e.target.checked })}
            {...({ switch: '' } as Record<string, string>)}
          />
        </label>
      </section>

      {/* Reminders */}
      <section className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Bell size={18} color="var(--color-brand-primary)" />
          <h2 className="section-title" style={{ margin: 0 }}>
            Smart Reminders
          </h2>
        </div>
        <p className="section-caption" style={{ marginBottom: 12 }}>
          Shown calmly inside the app, plus optional local browser notifications
        </p>

        <label className="setting-row" htmlFor="rem-period">
          <div className="setting-label-wrap">
            <span className="setting-title">Period Approaching</span>
            <span className="setting-desc">
              Alert {settings.reminders.periodBeforeDays} days before expected period
            </span>
          </div>
          <input
            id="rem-period"
            type="checkbox"
            checked={settings.reminders.periodEnabled}
            onChange={(e) =>
              onUpdateSettings({
                reminders: { ...settings.reminders, periodEnabled: e.target.checked },
              })
            }
            {...({ switch: '' } as Record<string, string>)}
          />
        </label>

        {settings.reminders.periodEnabled ? (
          <div className="setting-row">
            <span className="setting-desc">Days in advance</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 2, 3, 5].map((d) => (
                <button
                  key={d}
                  type="button"
                  className="chip tabular"
                  aria-pressed={settings.reminders.periodBeforeDays === d}
                  onClick={() =>
                    onUpdateSettings({
                      reminders: { ...settings.reminders, periodBeforeDays: d },
                    })
                  }
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="setting-row" htmlFor="rem-fertile">
          <div className="setting-label-wrap">
            <span className="setting-title">Fertile Window &amp; Ovulation</span>
            <span className="setting-desc">Gentle cue when entering your fertile window</span>
          </div>
          <input
            id="rem-fertile"
            type="checkbox"
            checked={settings.reminders.fertileEnabled}
            onChange={(e) =>
              onUpdateSettings({
                reminders: { ...settings.reminders, fertileEnabled: e.target.checked },
              })
            }
            {...({ switch: '' } as Record<string, string>)}
          />
        </label>

        <label className="setting-row" htmlFor="rem-daily">
          <div className="setting-label-wrap">
            <span className="setting-title">Daily Symptom Check-In</span>
            <span className="setting-desc">Prompt if today has no log yet</span>
          </div>
          <input
            id="rem-daily"
            type="checkbox"
            checked={settings.reminders.dailyLogEnabled}
            onChange={(e) =>
              onUpdateSettings({
                reminders: { ...settings.reminders, dailyLogEnabled: e.target.checked },
              })
            }
            {...({ switch: '' } as Record<string, string>)}
          />
        </label>

        {notifStatus !== 'unsupported' ? (
          <div className="card-subtle" style={{ marginTop: 12 }}>
            <p style={{ margin: '0 0 8px', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
              <strong>Why we ask:</strong> Browser notifications are generated locally on your device — no push server ever receives your dates.
            </p>
            <button
              type="button"
              className="btn-secondary"
              disabled={notifStatus === 'granted'}
              onClick={handleEnableNotifications}
            >
              <Bell size={16} />
              {notifStatus === 'granted'
                ? 'Browser Notifications Active'
                : notifStatus === 'denied'
                  ? 'Notifications Blocked in Browser'
                  : 'Enable Local Browser Notifications'}
            </button>
          </div>
        ) : null}
      </section>

      {/* Export, Backup & Data Rights */}
      <section className="card">
        <h2 className="section-title">Backup, Export &amp; Data Rights</h2>
        <p className="section-caption" style={{ marginBottom: 14 }}>
          You own 100% of your data. Export for your doctor, move devices, or erase instantly.
        </p>

        <div className="btn-row" style={{ marginBottom: 10 }}>
          <button type="button" className="btn-primary" onClick={onExportDoctorPdf}>
            <FileText size={16} />
            Doctor PDF Report
          </button>
          <button type="button" className="btn-secondary" onClick={onExportCsv}>
            <FileSpreadsheet size={16} />
            Export CSV
          </button>
        </div>

        <div className="btn-row" style={{ marginBottom: 10 }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setExportPassphrase('');
              setExportDialogOpen(true);
            }}
          >
            <Download size={16} />
            Export JSON Backup
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={16} />
            Import Backup
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={handleImportFileChange}
          />
        </div>

        <div className="btn-row">
          <button type="button" className="btn-secondary" onClick={onLoadSampleData}>
            <Sparkles size={16} />
            Load Sample Data
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => setEraseDialogOpen(true)}
          >
            <Trash2 size={16} />
            Erase All Data
          </button>
        </div>
      </section>

      {/* Set PIN Dialog */}
      <ModalDialog
        open={pinDialogOpen}
        title="Set 4-Digit Privacy PIN"
        subtitle="Your logs will be encrypted on-device with AES-GCM"
        onClose={() => setPinDialogOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setPinDialogOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleSavePin}>
              Enable PIN Lock
            </button>
          </>
        }
      >
        <label className="field-group">
          <span className="field-label">New 4-Digit PIN</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            autoFocus
            className="input-control tabular"
            placeholder="••••"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </label>
        <label className="field-group">
          <span className="field-label">Confirm 4-Digit PIN</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            className="input-control tabular"
            placeholder="••••"
            value={pinConfirm}
            onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </label>
        {pinError ? (
          <p role="alert" style={{ margin: 0, color: 'var(--color-feedback-error)', fontSize: '0.84rem' }}>
            {pinError}
          </p>
        ) : null}
        <p className="field-hint">
          Remember your PIN — because data never leaves your device, lost PINs cannot be recovered remotely.
        </p>
      </ModalDialog>

      {/* Export JSON Dialog */}
      <ModalDialog
        open={exportDialogOpen}
        title="Export Local Backup"
        subtitle="Add an optional passphrase to AES-GCM encrypt the backup file"
        onClose={() => setExportDialogOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setExportDialogOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={async () => {
                await onExportJson(exportPassphrase);
                setExportDialogOpen(false);
              }}
            >
              Download Backup
            </button>
          </>
        }
      >
        <label className="field-group">
          <span className="field-label">Encryption Passphrase (Optional)</span>
          <input
            type="password"
            autoFocus
            className="input-control"
            placeholder="Leave blank for plain JSON"
            value={exportPassphrase}
            onChange={(e) => setExportPassphrase(e.target.value)}
          />
          <p className="field-hint">
            Recommended if storing the backup in Google Drive, iCloud, or email.
          </p>
        </label>
      </ModalDialog>

      {/* Decrypt Imported Backup Dialog */}
      <ModalDialog
        open={importPassDialogOpen}
        title="Unlock Encrypted Backup"
        subtitle="Enter the passphrase used when this backup was exported"
        onClose={() => setImportPassDialogOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setImportPassDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={async () => {
                const res = await onImportJsonText(pendingImportText, importPassphrase);
                if (res === 'ok') {
                  setImportPassDialogOpen(false);
                  setPendingImportText('');
                }
              }}
            >
              Decrypt &amp; Restore
            </button>
          </>
        }
      >
        <label className="field-group">
          <span className="field-label">Backup Passphrase</span>
          <input
            type="password"
            autoFocus
            className="input-control"
            value={importPassphrase}
            onChange={(e) => setImportPassphrase(e.target.value)}
          />
        </label>
      </ModalDialog>

      {/* Erase Confirmation Dialog (autofocus on SAFE Cancel button per dialog guide!) */}
      <ModalDialog
        open={eraseDialogOpen}
        title="Erase All Local Data?"
        subtitle="This permanently deletes all logged periods, symptoms, settings, and PIN"
        onClose={() => setEraseDialogOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn-danger"
              onClick={async () => {
                await onEraseAllData();
                setEraseDialogOpen(false);
              }}
              style={{ marginRight: 'auto' }}
            >
              Erase Everything
            </button>
            <button
              type="button"
              className="btn-primary"
              autoFocus
              onClick={() => setEraseDialogOpen(false)}
            >
              Keep My Data
            </button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
          Because LunaCycle stores everything strictly on your device, erased data cannot be recovered unless you exported a JSON backup first.
        </p>
      </ModalDialog>
    </>
  );
}
