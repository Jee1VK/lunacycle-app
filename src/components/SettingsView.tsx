import { useRef, useState, type ChangeEvent } from 'react';
import {
  Bell,
  Download,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Fingerprint,
  Lock,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
} from 'lucide-react';
import { LANGUAGE_OPTIONS } from '../engine/i18n';
import { getPillReminderTimes } from '../engine/hygieneTimer';
import {
  isNativeNotificationRuntime,
  requestNativeNotificationPermission,
  sendTestPillAlarmNotification,
} from '../engine/nativeNotifications';
import type { OtaUpdateState } from '../engine/otaUpdater';
import { PILL_ALARM_TONE_OPTIONS, pillAlarmAudio } from '../engine/pillAlarmAudio';
import {
  CUSTOM_THEME_PRESETS,
  DEFAULT_CUSTOM_THEME,
  getContrastRatio,
  isDarkHex,
  sanitizeCustomTheme,
} from '../engine/themeEngine';
import { addDays, formatShortDate } from '../engine/temporal';
import {
  getNotificationSupport,
  requestNotificationPermission,
} from '../engine/reminders';
import type {
  LunaData,
  PillAlarmTone,
  PillRegimen,
  PinLockConfig,
  TrackingMode,
  UserSettings,
} from '../types';
import { ModalDialog } from './ModalDialog';

interface SettingsViewProps {
  data: LunaData;
  pinConfig: PinLockConfig | null;
  today: string;
  latestPeriodStartDate?: string | null;
  otaState: OtaUpdateState;
  biometricAvailable: boolean;
  biometricLabel: string;
  onCheckOtaUpdate: () => void;
  onApplyOtaUpdate: () => void;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
  onSetPin: (pin: string) => Promise<void>;
  onRemovePin: () => Promise<void>;
  onToggleBiometric: (enabled: boolean) => Promise<void>;
  onExportJson: (passphrase?: string) => Promise<void>;
  onImportJsonText: (fileText: string, passphrase?: string) => Promise<'ok' | 'needs_passphrase' | 'error'>;
  onImportExternalFile: (fileText: string) => void;
  onExportCsv: () => void;
  onExportDoctorPdf: () => void;
  onLoadSampleData: () => void;
  onEraseAllData: () => Promise<void>;
  onTriggerTestPillAlarm?: () => void;
  onNotify: (msg: string) => void;
}

export function SettingsView({
  data,
  pinConfig,
  today,
  latestPeriodStartDate,
  otaState,
  biometricAvailable,
  biometricLabel,
  onCheckOtaUpdate,
  onApplyOtaUpdate,
  onUpdateSettings,
  onSetPin,
  onRemovePin,
  onToggleBiometric,
  onExportJson,
  onImportJsonText,
  onImportExternalFile,
  onExportCsv,
  onExportDoctorPdf,
  onLoadSampleData,
  onEraseAllData,
  onTriggerTestPillAlarm,
  onNotify,
}: SettingsViewProps) {
  const { settings } = data;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const externalImportRef = useRef<HTMLInputElement>(null);

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
  const [privacyDialogOpen, setPrivacyDialogOpen] = useState(false);

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
    if (isNativeNotificationRuntime()) {
      const granted = await requestNativeNotificationPermission();
      onNotify(
        granted
          ? 'Native Android OS notifications enabled!'
          : 'Permission denied. Enable notifications in Android App Settings.',
      );
      return;
    }
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
      {/* Appearance, Language & Simple Mode */}
      <section className="card">
        <h2 className="section-title">Appearance, Language &amp; Comfort</h2>
        <p className="section-caption" style={{ marginBottom: 12 }}>
          Customize theme, language, and optional Simple / Teen Mode
        </p>

        <div className="field-group" style={{ marginBottom: 14 }}>
          <span className="field-label">Color Theme</span>
          <div className="theme-swatch-grid" role="group" aria-label="Color theme">
            {(
              [
                { id: 'system', label: 'System Auto', dots: ['#FAFAF7', '#141211', '#C5A059'] },
                { id: 'light', label: 'Pearl Light', dots: ['#FAFAF7', '#6B1D2F', '#C5A059'] },
                { id: 'dark', label: 'Warm Dark', dots: ['#141211', '#D97C8F', '#E0BE78'] },
                { id: 'burgundy', label: 'Velvet Burgundy', dots: ['#1A0B10', '#E68DA1', '#E5C37A'] },
                { id: 'maroon', label: 'Royal Maroon', dots: ['#F6ECEE', '#6B1D2F', '#B88E3E'] },
                {
                  id: 'custom',
                  label: 'Custom Studio',
                  dots: [
                    sanitizeCustomTheme(settings.customTheme).canvas,
                    sanitizeCustomTheme(settings.customTheme).primary,
                    sanitizeCustomTheme(settings.customTheme).accent,
                  ],
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="theme-swatch-card"
                aria-pressed={settings.theme === opt.id}
                onClick={() =>
                  onUpdateSettings(
                    opt.id === 'custom'
                      ? { theme: 'custom', customTheme: sanitizeCustomTheme(settings.customTheme) }
                      : { theme: opt.id },
                  )
                }
              >
                <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>{opt.label}</span>
                <span className="theme-swatch-dots" aria-hidden="true">
                  {opt.dots.map((hex, idx) => (
                    <span key={idx} className="theme-swatch-dot" style={{ background: hex }} />
                  ))}
                </span>
              </button>
            ))}
          </div>

          {settings.theme === 'custom' ? (() => {
            const custom = sanitizeCustomTheme(settings.customTheme);
            const btnTextContrast = Math.max(
              getContrastRatio(custom.primary, '#FFFFFF'),
              getContrastRatio(custom.primary, '#141211'),
            );
            const primaryOnCanvas = getContrastRatio(custom.primary, custom.canvas);
            const effectiveContrast = Math.min(btnTextContrast, primaryOnCanvas);
            const updateCustom = (patch: Partial<typeof custom>) => {
              const merged = { ...custom, ...patch };
              if (patch.canvas && !patch.baseMode) {
                merged.baseMode = isDarkHex(patch.canvas) ? 'dark' : 'light';
              }
              onUpdateSettings({
                theme: 'custom',
                customTheme: sanitizeCustomTheme(merged),
              });
            };
            return (
              <div className="card-subtle" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <strong style={{ fontSize: '0.86rem' }}>Custom Theme Studio</strong>
                  <span
                    className={`phase-badge tabular ${effectiveContrast >= 4.5 ? 'phase-badge--fertile' : 'phase-badge--menstrual'}`}
                    style={{ fontSize: '0.7rem' }}
                  >
                    {effectiveContrast >= 4.5 ? `WCAG AA ${effectiveContrast}:1` : `Low Contrast ${effectiveContrast}:1`}
                  </span>
                </div>
                <p className="section-caption">
                  Your custom colors also sync automatically to your connected Partner&apos;s page.
                </p>

                <div className="segmented" style={{ gridTemplateColumns: '1fr 1fr' }} role="group" aria-label="Custom base surface">
                  <button
                    type="button"
                    className="segmented-btn"
                    aria-pressed={custom.baseMode === 'light'}
                    onClick={() => updateCustom({ baseMode: 'light', canvas: '#FAFAF7' })}
                  >
                    Light Surface
                  </button>
                  <button
                    type="button"
                    className="segmented-btn"
                    aria-pressed={custom.baseMode === 'dark'}
                    onClick={() => updateCustom({ baseMode: 'dark', canvas: '#141211' })}
                  >
                    Dark Surface
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <label className="field-group">
                    <span className="field-label" style={{ fontSize: '0.74rem' }}>Primary</span>
                    <input
                      type="color"
                      aria-label="Custom primary color"
                      value={custom.primary}
                      onChange={(e) => updateCustom({ primary: e.target.value })}
                      style={{ width: '100%', height: 44, borderRadius: 8, border: '1px solid var(--color-border-subtle)', padding: 2, background: 'var(--color-surface-card)', cursor: 'pointer' }}
                    />
                  </label>
                  <label className="field-group">
                    <span className="field-label" style={{ fontSize: '0.74rem' }}>Accent</span>
                    <input
                      type="color"
                      aria-label="Custom accent color"
                      value={custom.accent}
                      onChange={(e) => updateCustom({ accent: e.target.value })}
                      style={{ width: '100%', height: 44, borderRadius: 8, border: '1px solid var(--color-border-subtle)', padding: 2, background: 'var(--color-surface-card)', cursor: 'pointer' }}
                    />
                  </label>
                  <label className="field-group">
                    <span className="field-label" style={{ fontSize: '0.74rem' }}>Background</span>
                    <input
                      type="color"
                      aria-label="Custom background color"
                      value={custom.canvas}
                      onChange={(e) => updateCustom({ canvas: e.target.value })}
                      style={{ width: '100%', height: 44, borderRadius: 8, border: '1px solid var(--color-border-subtle)', padding: 2, background: 'var(--color-surface-card)', cursor: 'pointer' }}
                    />
                  </label>
                </div>

                <div className="chip-group">
                  {CUSTOM_THEME_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      className="chip"
                      style={{ minHeight: 44, padding: '6px 12px', fontSize: '0.78rem' }}
                      onClick={() => updateCustom(preset.colors)}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 9999,
                          background: preset.colors.primary,
                          display: 'inline-block',
                        }}
                      />
                      {preset.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="chip"
                    style={{ minHeight: 44, padding: '6px 12px', fontSize: '0.78rem' }}
                    onClick={() => updateCustom(DEFAULT_CUSTOM_THEME)}
                  >
                    Reset
                  </button>
                </div>
              </div>
            );
          })() : null}
        </div>

        <div className="field-group" style={{ marginBottom: 12 }}>
          <span className="field-label">Language</span>
          <div className="chip-group" role="group" aria-label="App language">
            {LANGUAGE_OPTIONS.map((lang) => (
              <button
                key={lang.id}
                type="button"
                className="chip"
                aria-pressed={settings.language === lang.id}
                onClick={() => onUpdateSettings({ language: lang.id })}
              >
                {lang.native}
              </button>
            ))}
          </div>
        </div>

        <label className="setting-row" htmlFor="simple-mode-switch">
          <div className="setting-label-wrap">
            <span className="setting-title">Simple / Teen Mode</span>
            <span className="setting-desc">
              Hides Intimacy, Mucus, LH strips, and fertility/TTC fields everywhere
            </span>
          </div>
          <input
            id="simple-mode-switch"
            type="checkbox"
            checked={settings.simpleMode}
            onChange={(e) =>
              onUpdateSettings({
                simpleMode: e.target.checked,
                mode: e.target.checked ? 'cycle' : settings.mode,
              })
            }
            {...({ switch: '' } as Record<string, string>)}
          />
        </label>

        <label className="setting-row" htmlFor="settings-partner-only-switch">
          <div className="setting-label-wrap">
            <span className="setting-title">Partner-Only Phone Mode</span>
            <span className="setting-desc">
              Simplifies navigation to just Partner &amp; Settings on a partner&apos;s phone
            </span>
          </div>
          <input
            id="settings-partner-only-switch"
            type="checkbox"
            checked={Boolean(settings.partnerOnlyMode)}
            onChange={(e) => onUpdateSettings({ partnerOnlyMode: e.target.checked })}
            {...({ switch: '' } as Record<string, string>)}
          />
        </label>
      </section>

      {/* Tracking Mode (hidden in Simple / Teen Mode) */}
      {!settings.simpleMode ? (
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
      ) : null}

      {/* Cycle Baselines */}
      <section className="card">
        <h2 className="section-title">Cycle Defaults &amp; Units</h2>
        <p className="section-caption" style={{ marginBottom: 12 }}>
          Used before 2+ cycles are logged; predictions adapt automatically from your history
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          <div className="field-group">
            <span className="field-label">Cycle (days)</span>
            <div className="stepper-row">
              <button
                type="button"
                className="stepper-btn"
                aria-label="Decrease default cycle length"
                onClick={() =>
                  onUpdateSettings({
                    defaultCycleLength: Math.max(21, settings.defaultCycleLength - 1),
                  })
                }
              >
                −
              </button>
              <span className="tabular" style={{ fontWeight: 700 }}>
                {settings.defaultCycleLength}
              </span>
              <button
                type="button"
                className="stepper-btn"
                aria-label="Increase default cycle length"
                onClick={() =>
                  onUpdateSettings({
                    defaultCycleLength: Math.min(45, settings.defaultCycleLength + 1),
                  })
                }
              >
                +
              </button>
            </div>
          </div>

          <div className="field-group">
            <span className="field-label">Period (days)</span>
            <div className="stepper-row">
              <button
                type="button"
                className="stepper-btn"
                aria-label="Decrease default period length"
                onClick={() =>
                  onUpdateSettings({
                    defaultPeriodLength: Math.max(2, settings.defaultPeriodLength - 1),
                  })
                }
              >
                −
              </button>
              <span className="tabular" style={{ fontWeight: 700 }}>
                {settings.defaultPeriodLength}
              </span>
              <button
                type="button"
                className="stepper-btn"
                aria-label="Increase default period length"
                onClick={() =>
                  onUpdateSettings({
                    defaultPeriodLength: Math.min(10, settings.defaultPeriodLength + 1),
                  })
                }
              >
                +
              </button>
            </div>
          </div>

          <div className="field-group">
            <span className="field-label">Luteal (days)</span>
            <div className="stepper-row">
              <button
                type="button"
                className="stepper-btn"
                aria-label="Decrease luteal phase length"
                onClick={() =>
                  onUpdateSettings({
                    lutealLength: Math.max(10, settings.lutealLength - 1),
                  })
                }
              >
                −
              </button>
              <span className="tabular" style={{ fontWeight: 700 }}>
                {settings.lutealLength}
              </span>
              <button
                type="button"
                className="stepper-btn"
                aria-label="Increase luteal phase length"
                onClick={() =>
                  onUpdateSettings({
                    lutealLength: Math.min(18, settings.lutealLength + 1),
                  })
                }
              >
                +
              </button>
            </div>
          </div>
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

      {/* Contraception, Birth Control Mode & Pill Pack (hidden in Simple / Teen Mode) */}
      {!settings.simpleMode ? (
      <section className="card">
        <h2 className="section-title">Contraception &amp; Pill Pack</h2>
        <p className="section-caption" style={{ marginBottom: 12 }}>
          Optional birth control mode, daily pill pack checklist, and LARC renewal tracking
        </p>

        <label className="setting-row" htmlFor="bc-mode-switch">
          <div className="setting-label-wrap">
            <span className="setting-title">Birth Control Mode</span>
            <span className="setting-desc">
              Hides ovulation &amp; fertile window predictions across Today and Calendar
            </span>
          </div>
          <input
            id="bc-mode-switch"
            type="checkbox"
            checked={settings.birthControlMode}
            onChange={(e) => onUpdateSettings({ birthControlMode: e.target.checked })}
            {...({ switch: '' } as Record<string, string>)}
          />
        </label>

        <label className="setting-row" htmlFor="pill-pack-switch">
          <div className="setting-label-wrap">
            <span className="setting-title">Daily Pill Pack Tracker</span>
            <span className="setting-desc">
              Shows 28-day pill grid and streak on the Today screen
            </span>
          </div>
          <input
            id="pill-pack-switch"
            type="checkbox"
            checked={settings.pillPack.enabled}
            onChange={(e) =>
              onUpdateSettings({
                pillPack: {
                  ...settings.pillPack,
                  enabled: e.target.checked,
                  packStartDate: settings.pillPack.packStartDate ?? today,
                },
              })
            }
            {...({ switch: '' } as Record<string, string>)}
          />
        </label>

        {settings.pillPack.enabled ? (() => {
          const pillTimes = getPillReminderTimes(settings.pillPack);
          const startMode = settings.pillPack.startMode ?? 'date';
          const startPeriodDay = settings.pillPack.startPeriodDay ?? 2;
          const resolvedPeriodStart = latestPeriodStartDate
            ? addDays(latestPeriodStartDate, startPeriodDay - 1)
            : null;
          const updatePillTimes = (nextTimes: string[]) => {
            const safe = nextTimes.length > 0 ? nextTimes.slice(0, 4) : ['21:00'];
            onUpdateSettings({
              pillPack: {
                ...settings.pillPack,
                reminderTime: safe[0],
                reminderTimes: safe,
              },
            });
          };
          const defaultSlots = ['08:00', '14:00', '21:00', '22:00'];

          return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            <label className="field-group">
              <span className="field-label">Pill Pack Regimen</span>
              <select
                className="input-control"
                value={settings.pillPack.regimen}
                onChange={(e) => {
                  const nextRegimen = e.target.value as PillRegimen;
                  const defaultCount =
                    nextRegimen === '21_only'
                      ? 21
                      : nextRegimen === 'custom'
                        ? (settings.pillPack.totalPills ?? 30)
                        : 28;
                  onUpdateSettings({
                    pillPack: {
                      ...settings.pillPack,
                      regimen: nextRegimen,
                      totalPills: defaultCount,
                    },
                  });
                }}
              >
                <option value="21_only">21 Pills Only (21 active, no break)</option>
                <option value="21_7">21 / 7 (21 active + 7 break)</option>
                <option value="24_4">24 / 4 (24 active + 4 break)</option>
                <option value="28_active">28 Active Pills</option>
                <option value="custom">Custom Pill Count</option>
              </select>
            </label>

            <div className="field-group">
              <span className="field-label">When to Start Pack</span>
              <div className="segmented" style={{ gridTemplateColumns: '1fr 1fr' }} role="group" aria-label="Pill pack start trigger">
                <button
                  type="button"
                  className="segmented-btn"
                  aria-pressed={startMode === 'date'}
                  onClick={() =>
                    onUpdateSettings({
                      pillPack: { ...settings.pillPack, startMode: 'date' },
                    })
                  }
                >
                  Fixed Date
                </button>
                <button
                  type="button"
                  className="segmented-btn"
                  aria-pressed={startMode === 'period_day'}
                  onClick={() =>
                    onUpdateSettings({
                      pillPack: {
                        ...settings.pillPack,
                        startMode: 'period_day',
                        startPeriodDay: settings.pillPack.startPeriodDay ?? 2,
                      },
                    })
                  }
                >
                  Logged Period Day
                </button>
              </div>
            </div>

            {startMode === 'date' ? (
              <label className="field-group">
                <span className="field-label">Pack Start Date</span>
                <input
                  type="date"
                  className="input-control tabular"
                  value={settings.pillPack.packStartDate ?? today}
                  onChange={(e) =>
                    onUpdateSettings({
                      pillPack: { ...settings.pillPack, packStartDate: e.target.value || today },
                    })
                  }
                />
              </label>
            ) : (
              <div className="field-group">
                <span className="field-label">Start on Period Day (e.g. Day 2 of logged period)</span>
                <div className="stepper-row" style={{ maxWidth: 200 }}>
                  <button
                    type="button"
                    className="stepper-btn"
                    aria-label="Decrease start period day"
                    onClick={() =>
                      onUpdateSettings({
                        pillPack: {
                          ...settings.pillPack,
                          startPeriodDay: Math.max(1, startPeriodDay - 1),
                        },
                      })
                    }
                  >
                    −
                  </button>
                  <span className="tabular" style={{ fontWeight: 700 }}>
                    Day {startPeriodDay}
                  </span>
                  <button
                    type="button"
                    className="stepper-btn"
                    aria-label="Increase start period day"
                    onClick={() =>
                      onUpdateSettings({
                        pillPack: {
                          ...settings.pillPack,
                          startPeriodDay: Math.min(7, startPeriodDay + 1),
                        },
                      })
                    }
                  >
                    +
                  </button>
                </div>
                <p className="field-hint">
                  {resolvedPeriodStart
                    ? `Auto-aligned to ${formatShortDate(resolvedPeriodStart)} (Day ${startPeriodDay} of your latest logged period).`
                    : `Log a period to auto-start on Period Day ${startPeriodDay}. Currently using ${formatShortDate(settings.pillPack.packStartDate ?? today)}.`}
                </p>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 10 }}>
              <div className="field-group">
                <span className="field-label">Total Pills in Pack</span>
                <div className="stepper-row">
                  <button
                    type="button"
                    className="stepper-btn"
                    aria-label="Decrease total pills in pack"
                    onClick={() =>
                      onUpdateSettings({
                        pillPack: {
                          ...settings.pillPack,
                          totalPills: Math.max(1, (settings.pillPack.totalPills ?? 28) - 1),
                        },
                      })
                    }
                  >
                    −
                  </button>
                  <span className="tabular" style={{ fontWeight: 700 }}>
                    {settings.pillPack.totalPills ?? 28}
                  </span>
                  <button
                    type="button"
                    className="stepper-btn"
                    aria-label="Increase total pills in pack"
                    onClick={() =>
                      onUpdateSettings({
                        pillPack: {
                          ...settings.pillPack,
                          totalPills: Math.min(90, (settings.pillPack.totalPills ?? 28) + 1),
                        },
                      })
                    }
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="field-group">
                <span className="field-label">Pills per Day</span>
                <div className="stepper-row">
                  <button
                    type="button"
                    className="stepper-btn"
                    aria-label="Decrease pills per day"
                    onClick={() =>
                      onUpdateSettings({
                        pillPack: {
                          ...settings.pillPack,
                          pillsPerDay: Math.max(1, (settings.pillPack.pillsPerDay ?? 1) - 1),
                        },
                      })
                    }
                  >
                    −
                  </button>
                  <span className="tabular" style={{ fontWeight: 700 }}>
                    {settings.pillPack.pillsPerDay ?? 1}
                  </span>
                  <button
                    type="button"
                    className="stepper-btn"
                    aria-label="Increase pills per day"
                    onClick={() =>
                      onUpdateSettings({
                        pillPack: {
                          ...settings.pillPack,
                          pillsPerDay: Math.min(4, (settings.pillPack.pillsPerDay ?? 1) + 1),
                        },
                      })
                    }
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <label className="setting-row" htmlFor="pill-alarm-switch" style={{ paddingTop: 6 }}>
              <div className="setting-label-wrap">
                <span className="setting-title">MedClock-Style Pill Alarm &amp; Notifications</span>
                <span className="setting-desc">
                  Full-screen looping alarm with snooze + Android OS alerts even when closed
                </span>
              </div>
              <input
                id="pill-alarm-switch"
                type="checkbox"
                checked={settings.pillPack.alarmEnabled ?? true}
                onChange={async (e) => {
                  const enabled = e.target.checked;
                  onUpdateSettings({
                    pillPack: { ...settings.pillPack, alarmEnabled: enabled },
                  });
                  if (enabled) {
                    void pillAlarmAudio.unlock();
                    if (isNativeNotificationRuntime()) {
                      await requestNativeNotificationPermission();
                    } else {
                      await requestNotificationPermission();
                    }
                  }
                }}
                {...({ switch: '' } as Record<string, string>)}
              />
            </label>

            {(settings.pillPack.alarmEnabled ?? true) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="field-group">
                  <span className="field-label">Number of Daily Reminders</span>
                  <div className="stepper-row" style={{ maxWidth: 200 }}>
                    <button
                      type="button"
                      className="stepper-btn"
                      aria-label="Decrease number of daily pill reminders"
                      onClick={() => {
                        if (pillTimes.length > 1) {
                          updatePillTimes(pillTimes.slice(0, -1));
                        }
                      }}
                    >
                      −
                    </button>
                    <span className="tabular" style={{ fontWeight: 700 }}>
                      {pillTimes.length} {pillTimes.length === 1 ? 'reminder' : 'reminders'}
                    </span>
                    <button
                      type="button"
                      className="stepper-btn"
                      aria-label="Increase number of daily pill reminders"
                      onClick={() => {
                        if (pillTimes.length < 4) {
                          const nextSlot =
                            defaultSlots.find((s) => !pillTimes.includes(s)) ?? '21:30';
                          updatePillTimes([...pillTimes, nextSlot]);
                        }
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))', gap: 8 }}>
                  {pillTimes.map((tVal, idx) => (
                    <label key={idx} className="field-group">
                      <span className="field-label">Reminder {idx + 1}</span>
                      <input
                        type="time"
                        className="input-control tabular"
                        value={tVal}
                        onChange={(e) => {
                          const copy = [...pillTimes];
                          copy[idx] = e.target.value || '21:00';
                          updatePillTimes(copy);
                        }}
                      />
                    </label>
                  ))}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
                  <label className="field-group" style={{ flex: '1 1 150px' }}>
                    <span className="field-label">Alarm Tone</span>
                    <select
                      className="input-control"
                      value={settings.pillPack.alarmTone ?? 'temple_chime'}
                      onChange={(e) => {
                        const tone = e.target.value as PillAlarmTone;
                        onUpdateSettings({
                          pillPack: { ...settings.pillPack, alarmTone: tone },
                        });
                        pillAlarmAudio.preview(tone);
                      }}
                    >
                      {PILL_ALARM_TONE_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ minHeight: 44 }}
                    onClick={async () => {
                      onTriggerTestPillAlarm?.();
                      await sendTestPillAlarmNotification(
                        settings.pillPack.pillsPerDay ?? 1,
                        settings.disguiseMode,
                        settings.reminders.customNotificationText,
                      );
                    }}
                  >
                    <Bell size={15} />
                    Test Full Alarm
                  </button>
                </div>
              </div>
            ) : null}

            <label className="setting-row" htmlFor="pill-refill-switch">
              <div className="setting-label-wrap">
                <span className="setting-title">Refill Reminder</span>
                <span className="setting-desc">
                  Alerts you before your current pack runs out so you never miss a refill
                </span>
              </div>
              <input
                id="pill-refill-switch"
                type="checkbox"
                checked={settings.pillPack.refillReminderEnabled ?? true}
                onChange={(e) =>
                  onUpdateSettings({
                    pillPack: { ...settings.pillPack, refillReminderEnabled: e.target.checked },
                  })
                }
                {...({ switch: '' } as Record<string, string>)}
              />
            </label>

            {(settings.pillPack.refillReminderEnabled ?? true) ? (
              <div className="field-group">
                <span className="field-label">Remind to refill when this many days remain</span>
                <div className="stepper-row" style={{ maxWidth: 180 }}>
                  <button
                    type="button"
                    className="stepper-btn"
                    aria-label="Decrease refill threshold days"
                    onClick={() =>
                      onUpdateSettings({
                        pillPack: {
                          ...settings.pillPack,
                          refillThresholdDays: Math.max(1, (settings.pillPack.refillThresholdDays ?? 5) - 1),
                        },
                      })
                    }
                  >
                    −
                  </button>
                  <span className="tabular" style={{ fontWeight: 700 }}>
                    {settings.pillPack.refillThresholdDays ?? 5} days
                  </span>
                  <button
                    type="button"
                    className="stepper-btn"
                    aria-label="Increase refill threshold days"
                    onClick={() =>
                      onUpdateSettings({
                        pillPack: {
                          ...settings.pillPack,
                          refillThresholdDays: Math.min(14, (settings.pillPack.refillThresholdDays ?? 5) + 1),
                        },
                      })
                    }
                  >
                    +
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          );
        })() : null}
      </section>
      ) : null}

      {/* Privacy & Security Vault */}
      <section className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <ShieldCheck size={19} color="var(--color-brand-secondary)" />
          <h2 className="section-title" style={{ margin: 0 }}>
            Privacy &amp; Security Vault
          </h2>
        </div>
        <p className="section-caption" style={{ marginBottom: 10 }}>
          Local-first IndexedDB storage with zero accounts, ads, or analytics. Network requests are only used for GitHub Pages OTA update checks and (if you opt in) end-to-end encrypted Partner Sync via Cloudflare Workers.
        </p>
        <div style={{ marginBottom: 14 }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ minHeight: 44, fontSize: '0.84rem' }}
            onClick={() => setPrivacyDialogOpen(true)}
          >
            <FileText size={15} />
            Privacy Notice &amp; Legal (DPDP Act)
          </button>
        </div>

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

        {biometricAvailable ? (
          <label className="setting-row" htmlFor="biometric-switch">
            <div className="setting-label-wrap">
              <span className="setting-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Fingerprint size={16} color="var(--color-brand-primary)" />
                {biometricLabel} Unlock
              </span>
              <span className="setting-desc">
                {pinConfig?.enabled
                  ? 'Unlock your AES-GCM vault via Android Hardware Keystore'
                  : 'Set a 4-digit PIN above first to enable biometric unlock'}
              </span>
            </div>
            <input
              id="biometric-switch"
              type="checkbox"
              disabled={!pinConfig?.enabled}
              checked={Boolean(pinConfig?.biometricEnabled)}
              onChange={(e) => void onToggleBiometric(e.target.checked)}
              {...({ switch: '' } as Record<string, string>)}
            />
          </label>
        ) : null}

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

        <label className="setting-row" htmlFor="rem-pms">
          <div className="setting-label-wrap">
            <span className="setting-title">PMS Window Heads-Up</span>
            <span className="setting-desc">Gentle cue 3–5 days before expected period</span>
          </div>
          <input
            id="rem-pms"
            type="checkbox"
            checked={settings.reminders.pmsEnabled}
            onChange={(e) =>
              onUpdateSettings({
                reminders: { ...settings.reminders, pmsEnabled: e.target.checked },
              })
            }
            {...({ switch: '' } as Record<string, string>)}
          />
        </label>

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

        <label className="field-group" style={{ marginTop: 10 }}>
          <span className="field-label">Custom Discreet Notification Text (Optional)</span>
          <input
            type="text"
            className="input-control"
            placeholder="e.g. Remember your herbal tea"
            value={settings.reminders.customNotificationText}
            onChange={(e) =>
              onUpdateSettings({
                reminders: { ...settings.reminders, customNotificationText: e.target.value },
              })
            }
          />
          <p className="field-hint">
            Overrides Android OS notification body text so lock-screen alerts stay completely private.
          </p>
        </label>

        {notifStatus !== 'unsupported' || isNativeNotificationRuntime() ? (
          <div className="card-subtle" style={{ marginTop: 12 }}>
            <p style={{ margin: '0 0 8px', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
              <strong>Why we ask:</strong>{' '}
              {isNativeNotificationRuntime()
                ? 'Native Android notifications fire locally on your phone even when the app is closed — zero push servers.'
                : 'Browser notifications are generated locally on your device — no push server ever receives your dates.'}
            </p>
            <button
              type="button"
              className="btn-secondary"
              disabled={!isNativeNotificationRuntime() && notifStatus === 'granted'}
              onClick={handleEnableNotifications}
            >
              <Bell size={16} />
              {isNativeNotificationRuntime()
                ? 'Enable Native Android OS Notifications'
                : notifStatus === 'granted'
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

        <div className="btn-row" style={{ marginBottom: 10 }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => externalImportRef.current?.click()}
          >
            <Upload size={16} />
            Import from Flo / Clue (JSON or CSV)
          </button>
          <input
            ref={externalImportRef}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const text = await file.text();
              onImportExternalFile(text);
            }}
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

      {/* App Version & Over-The-Air (OTA) Live Updates */}
      <section className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Smartphone size={18} color="var(--color-brand-primary)" />
            <h2 className="section-title" style={{ margin: 0 }}>
              App Version &amp; Live OTA Updates
            </h2>
          </div>
          <span className="phase-badge phase-badge--follicular tabular">
            v{otaState.currentVersion}
          </span>
        </div>
        <p className="section-caption" style={{ marginBottom: 12 }}>
          {otaState.isNativeApk
            ? 'Running inside the native Android APK with PWA-style Over-The-Air live updates enabled.'
            : 'Running as an installable offline-first PWA with live Over-The-Air updates.'}
        </p>

        <div className="btn-row">
          {otaState.updateAvailable ? (
            <button type="button" className="btn-primary" onClick={onApplyOtaUpdate}>
              <RefreshCw size={16} />
              Install Live Update{otaState.latestVersion ? ` (v${otaState.latestVersion})` : ''}
            </button>
          ) : (
            <button
              type="button"
              className="btn-secondary"
              disabled={otaState.checking}
              onClick={onCheckOtaUpdate}
            >
              <RefreshCw size={16} />
              {otaState.checking ? 'Checking…' : 'Check for Live Update'}
            </button>
          )}
          {!otaState.isNativeApk ? (
            <a
              href="https://github.com/Jee1VK/lunacycle-app/releases/download/latest/LunaCycle.apk"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              style={{ textDecoration: 'none', flex: '1 1 140px' }}
            >
              <Download size={16} />
              Download Android APK
            </a>
          ) : null}
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

      {/* DPDP Act 2023 & Wellness Legal Privacy Notice Modal */}
      <ModalDialog
        open={privacyDialogOpen}
        title="Privacy Notice & Legal (DPDP Act)"
        subtitle="India DPDP Act 2023 · Non-Diagnostic General Wellness"
        onClose={() => setPrivacyDialogOpen(false)}
        footer={
          <button type="button" className="btn-primary" onClick={() => setPrivacyDialogOpen(false)}>
            Close
          </button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.84rem', color: 'var(--color-text-secondary)' }}>
          <div className="card-subtle">
            <strong style={{ color: 'var(--color-text-primary)' }}>1. Local-First Data &amp; Network Disclosure</strong>
            <p style={{ margin: '4px 0 0' }}>
              All cycle, symptom, mood, and pill logs stay strictly on your device in IndexedDB (optionally AES-256-GCM encrypted with your 4-digit PIN). LunaCycle has zero accounts, zero ads, and zero analytics. Outbound requests occur only for: (a) GitHub Pages OTA update checks (<code>version.json</code>), and (b) optional end-to-end encrypted Partner Sync via Cloudflare Workers KV (auto-deleted after 30 days for snapshots and 7 days for Care Pings).
            </p>
          </div>
          <div className="card-subtle">
            <strong style={{ color: 'var(--color-text-primary)' }}>2. Your Rights Under DPDP Act 2023</strong>
            <p style={{ margin: '4px 0 0' }}>
              You may withdraw Partner Sync consent at any time via <strong>Stop Sharing &amp; Wipe Relay Copy</strong>, export your data (JSON/CSV/PDF), or permanently erase all local and remote data via <strong>Erase All Data</strong>. You also have the right to escalate unresolved privacy grievances to the <strong>Data Protection Board of India (DPBI)</strong>.
            </p>
          </div>
          <div className="card-subtle">
            <strong style={{ color: 'var(--color-text-primary)' }}>3. Age Eligibility (Under-18 Protection)</strong>
            <p style={{ margin: '4px 0 0' }}>
              Cloud Partner Sync is restricted to users aged 18+ with explicit consent and is automatically disabled in Simple / Teen Mode.
            </p>
          </div>
          <div className="card-subtle">
            <strong style={{ color: 'var(--color-text-primary)' }}>4. General Wellness Notice (Non-SaMD)</strong>
            <p style={{ margin: '4px 0 0' }}>
              LunaCycle is a personal self-tracking and wellness companion. It is not a medical device, does not diagnose or treat any condition, is not a contraceptive method, and contains zero fetal sex/gender prediction features (PCPNDT Act compliant).
            </p>
          </div>
          <div className="card-subtle">
            <strong style={{ color: 'var(--color-text-primary)' }}>5. Summary in Supported Indian Languages</strong>
            <p style={{ margin: '4px 0 0', lineHeight: 1.55 }}>
              <strong>ಕನ್ನಡ:</strong> ನಿಮ್ಮ ಎಲ್ಲಾ ಡೇಟಾ ನಿಮ್ಮ ಫೋನ್‌ನಲ್ಲಿ ಮಾತ್ರ ಸುರಕ್ಷಿತವಾಗಿರುತ್ತದೆ. ಪಾಲುದಾರರ ಹಂಚಿಕೆ ಐಚ್ಛಿಕ ಮತ್ತು ಎಂಡ್-ಟು-ಎಂಡ್ ಎನ್‌ಕ್ರಿಪ್ಟ್ ಆಗಿದೆ.<br />
              <strong>हिन्दी:</strong> आपका सारा डेटा केवल आपके फ़ोन में सुरक्षित रहता है। पार्टनर शेयरिंग वैकल्पिक और एंड-टू-एंड एन्क्रिप्टेड है।<br />
              <strong>தமிழ்:</strong> உங்கள் தரவு அனைத்தும் உங்கள் சாதனத்தில் மட்டுமே சேமிக்கப்படும். பார்ட்னர் பகிர்வு விருப்பத்திற்குரியது மற்றும் என்க்ரிப்ட் செய்யப்பட்டது.<br />
              <strong>తెలుగు:</strong> మీ డేటా అంతా మీ ఫోన్‌లోనే సురక్షితంగా ఉంటుంది. పార్ట్‌నర్ షేరింగ్ ఐచ్ఛికం మరియు ఎండ్-టు-ఎండ్ ఎన్‌క్రిప్ట్ చేయబడింది.
            </p>
          </div>
          <p className="field-hint">
            Resident Grievance Officer contact details (24h acknowledgement / 15-day resolution SLA) will be published here prior to public app-store distribution.
          </p>
        </div>
      </ModalDialog>
    </>
  );
}
