import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Calendar,
  HeartHandshake,
  Lock,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { CalendarView } from './components/CalendarView';
import { DailyLogDialog } from './components/DailyLogDialog';
import { InsightsView } from './components/InsightsView';
import { PartnerView } from './components/PartnerView';
import { PinLockScreen } from './components/PinLockScreen';
import { SettingsView } from './components/SettingsView';
import { TodayView } from './components/TodayView';
import { buildSampleDemoData } from './engine/catalog';
import {
  createPinConfig,
  eraseAllVaultData,
  loadCachedPartnerSnapshotFromVault,
  loadLunaData,
  loadPartnerShareConfigFromVault,
  loadPartnerWatchConfigFromVault,
  loadPinConfig,
  saveCachedPartnerSnapshotToVault,
  saveLunaData,
  savePartnerShareConfigToVault,
  savePartnerWatchConfigToVault,
  savePinConfig,
  verifyPin,
} from './engine/cryptoStorage';
import {
  computeCycleStats,
  computePhaseSymptomInsights,
  computeTodaySummary,
  isActiveBleedingFlow,
} from './engine/cycleEngine';
import {
  exportCsvLogs,
  exportJsonBackup,
  openDoctorPdfReport,
  parseImportedBackup,
} from './engine/exportReport';
import {
  buildPartnerSnapshot,
  createDefaultPartnerShareConfig,
  deletePartnerSnapshot,
  fetchPartnerSnapshot,
  pushPartnerSnapshot,
} from './engine/partnerSync';
import {
  computeActiveReminders,
  dispatchGentleBrowserNotification,
} from './engine/reminders';
import { todayPlainDate } from './engine/temporal';
import type {
  DailyLog,
  LunaData,
  PartnerShareConfig,
  PartnerSnapshot,
  PartnerWatchConfig,
  PinLockConfig,
  UserSettings,
} from './types';
import { createEmptyLog, createInitialData } from './types';

type TabId = 'today' | 'calendar' | 'partner' | 'insights' | 'settings';

export function App() {
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<LunaData>(() => createInitialData());
  const [pinConfig, setPinConfig] = useState<PinLockConfig | null>(null);
  const [activePin, setActivePin] = useState<string | undefined>(undefined);
  const [locked, setLocked] = useState(false);

  const [partnerShareConfig, setPartnerShareConfig] = useState<PartnerShareConfig>(() =>
    createDefaultPartnerShareConfig(),
  );
  const [partnerWatchConfig, setPartnerWatchConfig] = useState<PartnerWatchConfig | null>(null);
  const [watchedPartnerSnapshot, setWatchedPartnerSnapshot] = useState<PartnerSnapshot | null>(null);

  const [activeTab, setActiveTab] = useState<TabId>('today');
  const [calendarEditInit, setCalendarEditInit] = useState(false);
  const [logDialogDate, setLogDialogDate] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const autoSyncTimerRef = useRef<number | null>(null);
  const today = todayPlainDate();

  const showToast = (msg: string) => {
    setToast(msg);
  };

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Initial load from IndexedDB private vault
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cfg, storedShare, storedWatch, storedSnap] = await Promise.all([
          loadPinConfig(),
          loadPartnerShareConfigFromVault(),
          loadPartnerWatchConfigFromVault(),
          loadCachedPartnerSnapshotFromVault(),
        ]);
        if (cancelled) return;

        if (storedShare) setPartnerShareConfig(storedShare);
        if (storedWatch) setPartnerWatchConfig(storedWatch);
        if (storedSnap) setWatchedPartnerSnapshot(storedSnap);

        if (cfg?.enabled) {
          setPinConfig(cfg);
          setLocked(true);
          setReady(true);
        } else {
          const loaded = await loadLunaData();
          if (cancelled) return;
          setData(loaded);
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setData(createInitialData());
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-lock when app tab goes to background if PIN is enabled
  useEffect(() => {
    if (!pinConfig?.enabled || !pinConfig.autoLockOnHide) return;
    const onVisChange = () => {
      if (document.visibilityState === 'hidden') {
        setActivePin(undefined);
        setLocked(true);
      }
    };
    document.addEventListener('visibilitychange', onVisChange);
    return () => document.removeEventListener('visibilitychange', onVisChange);
  }, [pinConfig]);

  // Sync page title & icon for Disguise Mode
  useEffect(() => {
    const disguised = data.settings.disguiseMode;
    document.title = disguised
      ? 'Daily Notes — Personal Journal'
      : 'LunaCycle — Private Cycle & Wellness';
    const iconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (iconLink) {
      iconLink.href = disguised ? './icon-disguise.svg' : './icon-192.png';
    }
  }, [data.settings.disguiseMode]);

  const persistData = async (next: LunaData, pinOverride?: string) => {
    setData(next);
    try {
      await saveLunaData(next, pinOverride ?? activePin);
    } catch {
      showToast('Could not save to local vault.');
    }
  };

  const handleUpdatePartnerShareConfig = (cfg: PartnerShareConfig) => {
    setPartnerShareConfig(cfg);
    void savePartnerShareConfigToVault(cfg);
  };

  const handleUpdatePartnerWatchConfig = (cfg: PartnerWatchConfig | null) => {
    setPartnerWatchConfig(cfg);
    void savePartnerWatchConfigToVault(cfg);
  };

  const handleUpdateWatchedPartnerSnapshot = (snap: PartnerSnapshot | null) => {
    setWatchedPartnerSnapshot(snap);
    void saveCachedPartnerSnapshotToVault(snap);
  };

  const stats = useMemo(
    () => computeCycleStats(data.logs, data.settings),
    [data.logs, data.settings],
  );

  const summary = useMemo(
    () => computeTodaySummary(today, data.logs, stats, data.settings),
    [today, data.logs, stats, data.settings],
  );

  const activeReminders = useMemo(
    () => computeActiveReminders(data, summary),
    [data, summary],
  );

  // Live Auto-Sync: push updated privacy-scoped snapshot whenever logs/settings/permissions change
  useEffect(() => {
    if (!ready || locked || !partnerShareConfig.enabled || !partnerShareConfig.syncServerUrl.trim()) {
      return;
    }
    if (autoSyncTimerRef.current) {
      window.clearTimeout(autoSyncTimerRef.current);
    }
    autoSyncTimerRef.current = window.setTimeout(() => {
      const snap = buildPartnerSnapshot(partnerShareConfig, data, stats, summary);
      void pushPartnerSnapshot(partnerShareConfig, snap).then((res) => {
        if (res.ok) {
          const updated: PartnerShareConfig = {
            ...partnerShareConfig,
            lastSyncedAt: new Date().toISOString(),
          };
          setPartnerShareConfig(updated);
          void savePartnerShareConfigToVault(updated);
        }
      });
    }, 1200);

    return () => {
      if (autoSyncTimerRef.current) {
        window.clearTimeout(autoSyncTimerRef.current);
      }
    };
  }, [
    ready,
    locked,
    data,
    stats,
    summary,
    partnerShareConfig.enabled,
    partnerShareConfig.code,
    partnerShareConfig.profileLabel,
    partnerShareConfig.pinHash,
    partnerShareConfig.syncServerUrl,
    partnerShareConfig.permissions.shareFertileWindow,
    partnerShareConfig.permissions.shareSymptomsAndMood,
    partnerShareConfig.permissions.shareUpcomingForecast,
  ]);

  // Partner Auto-Refresh every 60s when connected to a partner
  useEffect(() => {
    if (!ready || locked || !partnerWatchConfig) return;
    let cancelled = false;

    const refresh = async () => {
      const res = await fetchPartnerSnapshot(partnerWatchConfig);
      if (cancelled || !res.snapshot) return;
      setWatchedPartnerSnapshot(res.snapshot);
      void saveCachedPartnerSnapshotToVault(res.snapshot);

      // Gentle partner notification on this phone if enabled
      if (partnerWatchConfig.alertsOnThisPhone && res.snapshot.mode !== 'pregnancy') {
        const snap = res.snapshot;
        if (snap.isPeriodActiveToday) {
          const key = `luna_partner_alert_${today}_active`;
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, '1');
            dispatchGentleBrowserNotification(
              `${snap.profileLabel}'s period is active`,
              'Check the Partner tab for comfort cues and support tips.',
              data.settings.disguiseMode,
            );
          }
        } else if (snap.daysUntilNextPeriod !== null && snap.daysUntilNextPeriod <= 2) {
          const key = `luna_partner_alert_${today}_soon`;
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, '1');
            dispatchGentleBrowserNotification(
              `${snap.profileLabel}'s period expected in ${snap.daysUntilNextPeriod}d`,
              'Great time to plan ahead and be extra supportive.',
              data.settings.disguiseMode,
            );
          }
        }
      }
    };

    void refresh();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [ready, locked, partnerWatchConfig?.code, partnerWatchConfig?.pinHash, partnerWatchConfig?.syncServerUrl, partnerWatchConfig?.alertsOnThisPhone, today, data.settings.disguiseMode]);

  // Dispatch gentle local notification once per day for own reminders
  useEffect(() => {
    if (!ready || locked || activeReminders.length === 0) return;
    const first = activeReminders[0];
    const key = `luna_notif_${today}_${first.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    dispatchGentleBrowserNotification(first.title, first.body, data.settings.disguiseMode);
  }, [ready, locked, activeReminders, today, data.settings.disguiseMode]);

  const handleUnlock = async (pin: string): Promise<boolean> => {
    if (!pinConfig) return false;
    const ok = await verifyPin(pin, pinConfig);
    if (!ok) return false;
    try {
      const unlockedData = await loadLunaData(pin);
      setData(unlockedData);
      setActivePin(pin);
      setLocked(false);
      return true;
    } catch {
      return false;
    }
  };

  const handleSaveLog = (log: DailyLog) => {
    const isEmpty =
      log.flow === 'none' &&
      log.symptoms.length === 0 &&
      log.moods.length === 0 &&
      log.mucus === 'none' &&
      log.lhTest === 'none' &&
      log.bbtC === undefined &&
      log.sleepHours === undefined &&
      log.waterGlasses === undefined &&
      !log.sexLogged &&
      log.notes.trim() === '';

    const nextLogs = { ...data.logs };
    if (isEmpty) {
      delete nextLogs[log.date];
    } else {
      nextLogs[log.date] = log;
    }
    void persistData({ ...data, logs: nextLogs });
    showToast('Day log saved privately.');
  };

  const handleDeleteLog = (date: string) => {
    const nextLogs = { ...data.logs };
    delete nextLogs[date];
    void persistData({ ...data, logs: nextLogs });
    showToast('Log cleared for that day.');
  };

  const handleTogglePeriodDate = (date: string) => {
    const existing = data.logs[date];
    const currentlyBleeding = Boolean(existing && isActiveBleedingFlow(existing.flow));
    const nextFlow = currentlyBleeding ? 'none' : 'medium';

    const updatedLog: DailyLog = existing
      ? { ...existing, flow: nextFlow }
      : { ...createEmptyLog(date), flow: nextFlow };

    const nextLogs = { ...data.logs };
    const isNowEmpty =
      updatedLog.flow === 'none' &&
      updatedLog.symptoms.length === 0 &&
      updatedLog.moods.length === 0 &&
      updatedLog.mucus === 'none' &&
      updatedLog.lhTest === 'none' &&
      updatedLog.bbtC === undefined &&
      updatedLog.sleepHours === undefined &&
      updatedLog.waterGlasses === undefined &&
      !updatedLog.sexLogged &&
      updatedLog.notes.trim() === '';

    if (isNowEmpty) {
      delete nextLogs[date];
    } else {
      nextLogs[date] = updatedLog;
    }
    void persistData({ ...data, logs: nextLogs });
  };

  const handleQuickTogglePeriodToday = () => {
    const wasActive = summary.isPeriodActiveToday;
    handleTogglePeriodDate(today);
    showToast(wasActive ? 'Removed period entry for today.' : 'Logged period for today.');
  };

  const handleUpdateSettings = (patch: Partial<UserSettings>) => {
    const nextSettings: UserSettings = {
      ...data.settings,
      ...patch,
      reminders: patch.reminders
        ? { ...data.settings.reminders, ...patch.reminders }
        : data.settings.reminders,
    };
    void persistData({ ...data, settings: nextSettings });
  };

  const handleSetPin = async (pin: string) => {
    const cfg = await createPinConfig(pin, true);
    await savePinConfig(cfg);
    await saveLunaData(data, pin);
    setPinConfig(cfg);
    setActivePin(pin);
    showToast('PIN lock enabled & vault encrypted.');
  };

  const handleRemovePin = async () => {
    await savePinConfig(null);
    await saveLunaData(data, undefined);
    setPinConfig(null);
    setActivePin(undefined);
    showToast('PIN lock disabled.');
  };

  const handleExportDoctorPdf = () => {
    const insights = computePhaseSymptomInsights(data.logs, stats, data.settings, today);
    const opened = openDoctorPdfReport(data, stats, insights, today);
    if (!opened) {
      showToast('Please allow pop-ups to open the printable PDF summary.');
    }
  };

  const handleImportJsonText = async (
    fileText: string,
    passphrase?: string,
  ): Promise<'ok' | 'needs_passphrase' | 'error'> => {
    const res = await parseImportedBackup(fileText, passphrase);
    if (res.status === 'needs_passphrase') return 'needs_passphrase';
    if (res.status === 'error') {
      showToast(res.message);
      return 'error';
    }
    await persistData(res.data);
    showToast('Backup restored successfully.');
    return 'ok';
  };

  const handleLoadSampleData = () => {
    const sample = buildSampleDemoData(today);
    sample.settings.disguiseMode = data.settings.disguiseMode;
    void persistData(sample);
    showToast('Loaded 4 realistic sample cycles.');
  };

  const handleEraseAllData = async () => {
    if (partnerShareConfig.enabled) {
      await deletePartnerSnapshot(partnerShareConfig);
    }
    await eraseAllVaultData();
    setPinConfig(null);
    setActivePin(undefined);
    setData(createInitialData());
    setPartnerShareConfig(createDefaultPartnerShareConfig());
    setPartnerWatchConfig(null);
    setWatchedPartnerSnapshot(null);
    setLocked(false);
    showToast('All local & relay data permanently erased.');
  };

  if (!ready) {
    return (
      <main className="pin-screen">
        <p className="section-caption">Opening private local vault...</p>
      </main>
    );
  }

  if (locked) {
    return (
      <PinLockScreen
        disguiseMode={data.settings.disguiseMode}
        onUnlock={handleUnlock}
      />
    );
  }

  const disguised = data.settings.disguiseMode;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true" style={{ overflow: 'hidden' }}>
            {disguised ? (
              <BookOpen size={18} />
            ) : (
              <img
                src="./icon-192.png"
                alt=""
                width={36}
                height={36}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            )}
          </div>
          <div>
            <h1 className="brand-title">{disguised ? 'Daily Notes' : 'LunaCycle'}</h1>
            <p className="brand-subtitle">
              {disguised
                ? 'Private offline journal'
                : partnerShareConfig.enabled
                  ? 'On-device · Partner sync live'
                  : 'Private · Offline · Zero trackers'}
            </p>
          </div>
        </div>

        <div className="header-actions">
          {pinConfig?.enabled ? (
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                setActivePin(undefined);
                setLocked(true);
              }}
              aria-label="Lock app now"
              title="Lock app now"
            >
              <Lock size={18} />
            </button>
          ) : (
            <span
              className="phase-badge phase-badge--fertile"
              style={{ fontSize: '0.72rem', padding: '4px 9px' }}
              title="All health data stays strictly on this device unless you opt in to Partner Sync"
            >
              <ShieldCheck size={13} />
              On-device
            </span>
          )}
        </div>
      </header>

      <main className="app-main">
        {activeTab === 'today' ? (
          <TodayView
            data={data}
            stats={stats}
            summary={summary}
            reminders={activeReminders}
            onQuickTogglePeriodToday={handleQuickTogglePeriodToday}
            onOpenLogDialog={(d) => setLogDialogDate(d)}
            onLoadSampleData={handleLoadSampleData}
            onJumpToCalendarEdit={() => {
              setCalendarEditInit(true);
              setActiveTab('calendar');
            }}
          />
        ) : null}

        {activeTab === 'calendar' ? (
          <CalendarView
            data={data}
            stats={stats}
            today={today}
            initialEditPeriodsMode={calendarEditInit}
            onTogglePeriodDate={handleTogglePeriodDate}
            onOpenLogDialog={(d) => setLogDialogDate(d)}
          />
        ) : null}

        {activeTab === 'partner' ? (
          <PartnerView
            data={data}
            stats={stats}
            summary={summary}
            shareConfig={partnerShareConfig}
            onUpdateShareConfig={handleUpdatePartnerShareConfig}
            watchConfig={partnerWatchConfig}
            onUpdateWatchConfig={handleUpdatePartnerWatchConfig}
            watchedSnapshot={watchedPartnerSnapshot}
            onUpdateWatchedSnapshot={handleUpdateWatchedPartnerSnapshot}
            onNotify={showToast}
          />
        ) : null}

        {activeTab === 'insights' ? (
          <InsightsView
            data={data}
            stats={stats}
            today={today}
            onExportDoctorPdf={handleExportDoctorPdf}
          />
        ) : null}

        {activeTab === 'settings' ? (
          <SettingsView
            data={data}
            pinConfig={pinConfig}
            today={today}
            onUpdateSettings={handleUpdateSettings}
            onSetPin={handleSetPin}
            onRemovePin={handleRemovePin}
            onExportJson={async (pass) => {
              await exportJsonBackup(data, today, pass);
              showToast(pass?.trim() ? 'Encrypted backup downloaded.' : 'JSON backup downloaded.');
            }}
            onImportJsonText={handleImportJsonText}
            onExportCsv={() => {
              exportCsvLogs(data, today);
              showToast('CSV logs exported.');
            }}
            onExportDoctorPdf={handleExportDoctorPdf}
            onLoadSampleData={handleLoadSampleData}
            onEraseAllData={handleEraseAllData}
            onNotify={showToast}
          />
        ) : null}
      </main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <button
          type="button"
          className="nav-tab"
          aria-current={activeTab === 'today' ? 'page' : undefined}
          onClick={() => {
            setCalendarEditInit(false);
            setActiveTab('today');
          }}
        >
          <Sparkles size={19} />
          <span>Today</span>
        </button>
        <button
          type="button"
          className="nav-tab"
          aria-current={activeTab === 'calendar' ? 'page' : undefined}
          onClick={() => setActiveTab('calendar')}
        >
          <Calendar size={19} />
          <span>Calendar</span>
        </button>
        <button
          type="button"
          className="nav-tab"
          aria-current={activeTab === 'partner' ? 'page' : undefined}
          onClick={() => {
            setCalendarEditInit(false);
            setActiveTab('partner');
          }}
        >
          <HeartHandshake size={19} />
          <span>Partner</span>
        </button>
        <button
          type="button"
          className="nav-tab"
          aria-current={activeTab === 'insights' ? 'page' : undefined}
          onClick={() => {
            setCalendarEditInit(false);
            setActiveTab('insights');
          }}
        >
          <BarChart3 size={19} />
          <span>Insights</span>
        </button>
        <button
          type="button"
          className="nav-tab"
          aria-current={activeTab === 'settings' ? 'page' : undefined}
          onClick={() => {
            setCalendarEditInit(false);
            setActiveTab('settings');
          }}
        >
          <Settings size={19} />
          <span>Settings</span>
        </button>
      </nav>

      <DailyLogDialog
        open={logDialogDate !== null}
        date={logDialogDate}
        existingLog={logDialogDate ? data.logs[logDialogDate] : undefined}
        tempUnit={data.settings.tempUnit}
        mode={data.settings.mode}
        onSave={handleSaveLog}
        onDelete={handleDeleteLog}
        onClose={() => setLogDialogDate(null)}
      />

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
