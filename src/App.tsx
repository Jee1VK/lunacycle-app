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
import { PillRingingModal, type ActivePillRing } from './components/PillRingingModal';
import { PinLockScreen } from './components/PinLockScreen';
import { SettingsView } from './components/SettingsView';
import { TodayView } from './components/TodayView';
import {
  checkBiometricAvailability,
  clearBiometricCredentials,
  enableBiometricForVault,
  unlockVaultWithBiometric,
  type BiometricAvailability,
} from './engine/biometricAuth';
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
  hasNonFlowLogDetails,
  isActiveBleedingFlow,
} from './engine/cycleEngine';
import {
  exportCsvLogs,
  exportJsonBackup,
  openDoctorPdfReport,
  parseImportedBackup,
} from './engine/exportReport';
import {
  computePillPackStatus,
  createHygieneTimer,
  getPillReminderTimes,
  getProductMeta,
} from './engine/hygieneTimer';
import { getUiStrings } from './engine/i18n';
import { importExternalHistory } from './engine/importers';
import {
  scheduleNativeHygieneNotification,
  scheduleNativePillSnooze,
  subscribeNativePillAlarmTap,
  syncNativePartnerNotifications,
  syncNativeScheduledNotifications,
} from './engine/nativeNotifications';
import { pillAlarmAudio } from './engine/pillAlarmAudio';
import { buildImmediatePartnerCareAlert } from './engine/partnerNotifications';
import {
  applyOtaUpdateNow,
  checkForOtaUpdate,
  CURRENT_APP_VERSION,
  isRunningInsideNativeApk,
  type OtaUpdateState,
} from './engine/otaUpdater';
import {
  buildPartnerSnapshot,
  clearPartnerCarePing,
  createDefaultPartnerShareConfig,
  deletePartnerSnapshot,
  fetchPartnerCarePing,
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
  PartnerCarePing,
  PartnerShareConfig,
  PartnerSnapshot,
  PartnerWatchConfig,
  PinLockConfig,
  SanitaryProductType,
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
  const [biometricInfo, setBiometricInfo] = useState<BiometricAvailability>({
    available: false,
    label: 'Fingerprint',
  });

  const [partnerShareConfig, setPartnerShareConfig] = useState<PartnerShareConfig>(() =>
    createDefaultPartnerShareConfig(),
  );
  const [partnerWatchConfig, setPartnerWatchConfig] = useState<PartnerWatchConfig | null>(null);
  const [watchedPartnerSnapshot, setWatchedPartnerSnapshot] = useState<PartnerSnapshot | null>(null);
  const [incomingCarePing, setIncomingCarePing] = useState<PartnerCarePing | null>(null);
  const [prefillPartnerCode, setPrefillPartnerCode] = useState<string | null>(null);
  const [partnerPinAuthError, setPartnerPinAuthError] = useState(false);

  const [activeTab, setActiveTab] = useState<TabId>('today');
  const [calendarEditInit, setCalendarEditInit] = useState(false);
  const [logDialogDate, setLogDialogDate] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activePillRing, setActivePillRing] = useState<ActivePillRing | null>(null);
  const [pillSnooze, setPillSnooze] = useState<{ wakeAtMs: number; scheduledTime: string } | null>(null);
  const firedPillAlarmKeysRef = useRef<Set<string>>(new Set());
  const [otaState, setOtaState] = useState<OtaUpdateState>(() => ({
    currentVersion: CURRENT_APP_VERSION,
    latestVersion: null,
    updateAvailable: false,
    checking: false,
    lastCheckedAt: null,
    isNativeApk: isRunningInsideNativeApk(),
  }));

  const autoSyncTimerRef = useRef<number | null>(null);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const today = todayPlainDate();

  const showToast = (msg: string) => {
    setToast(msg);
  };

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Check for PWA-style Over-The-Air (OTA) live updates on startup and when returning to foreground
  const handleCheckOtaUpdate = async (manual = false) => {
    setOtaState((prev) => ({ ...prev, checking: true }));
    const res = await checkForOtaUpdate();
    setOtaState((prev) => ({
      ...prev,
      checking: false,
      latestVersion: res.latestVersion ?? prev.latestVersion,
      updateAvailable: res.updateAvailable,
      lastCheckedAt: new Date().toISOString(),
    }));
    if (manual) {
      if (res.offline) {
        showToast('Offline — will check for live updates when back online.');
      } else if (res.updateAvailable) {
        showToast(`Live update ready (${res.latestVersion ?? 'new build'}). Tap Update Now.`);
      } else {
        showToast('You are already on the latest live version.');
      }
    }
  };

  useEffect(() => {
    if (!ready) return;
    void handleCheckOtaUpdate(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void handleCheckOtaUpdate(false);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [ready]);

  // Initial load from IndexedDB private vault
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cfg, storedShare, storedWatch, storedSnap, bio] = await Promise.all([
          loadPinConfig(),
          loadPartnerShareConfigFromVault(),
          loadPartnerWatchConfigFromVault(),
          loadCachedPartnerSnapshotFromVault(),
          checkBiometricAvailability(),
        ]);
        if (cancelled) return;

        setBiometricInfo(bio);
        if (storedShare) setPartnerShareConfig(storedShare);
        if (storedWatch) setPartnerWatchConfig(storedWatch);
        if (storedSnap) setWatchedPartnerSnapshot(storedSnap);

        if (cfg?.enabled) {
          setPinConfig(cfg);
          if (cfg.disguiseMode || cfg.theme) {
            setData((prev) => ({
              ...prev,
              settings: {
                ...prev.settings,
                disguiseMode: Boolean(cfg.disguiseMode),
                theme: cfg.theme ?? prev.settings.theme,
              },
            }));
          }
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

  // Sync theme, language & mobile status bar theme-color on <html>
  useEffect(() => {
    document.documentElement.dataset.theme = data.settings.theme;
    document.documentElement.lang = data.settings.language;
    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeMeta) {
      const colorMap: Record<typeof data.settings.theme, string> = {
        system: '#6B1D2F',
        light: '#6B1D2F',
        dark: '#141211',
        burgundy: '#1A0B10',
        maroon: '#6B1D2F',
      };
      themeMeta.content = colorMap[data.settings.theme] ?? '#6B1D2F';
    }
  }, [data.settings.theme, data.settings.language]);

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

  const persistData = (next: LunaData, pinOverride?: string) => {
    setData(next);
    const pinToUse = pinOverride ?? activePin;
    persistQueueRef.current = persistQueueRef.current
      .then(() => saveLunaData(next, pinToUse))
      .catch(() => {
        showToast('Could not save to local vault.');
      });
    return persistQueueRef.current;
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

  const latestPeriodStartDate =
    stats.periods.length > 0 ? stats.periods[stats.periods.length - 1].startDate : null;

  const activeReminders = useMemo(
    () => computeActiveReminders(data, summary, latestPeriodStartDate),
    [data, summary, latestPeriodStartDate],
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
          const syncedAt = new Date().toISOString();
          setPartnerShareConfig((prev) => {
            const updated: PartnerShareConfig = { ...prev, lastSyncedAt: syncedAt };
            void savePartnerShareConfigToVault(updated);
            return updated;
          });
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
    partnerShareConfig.permissions.sharePillRefillStatus,
    partnerShareConfig.todayNeedStatus,
    partnerShareConfig.comfortPreferences,
  ]);

  // Poll for encrypted two-way Partner Care Pings when sharing is enabled
  useEffect(() => {
    if (!ready || locked || !partnerShareConfig.enabled || !partnerShareConfig.syncServerUrl.trim()) {
      return;
    }
    let cancelled = false;
    const pollCare = async () => {
      const ping = await fetchPartnerCarePing(partnerShareConfig);
      if (cancelled) return;
      if (ping) {
        const dismissedId = localStorage.getItem('luna_dismissed_care_ping_id');
        if (dismissedId !== ping.id) {
          setIncomingCarePing(ping);
          const notifKey = `luna_care_ping_notif_${ping.id}`;
          if (!sessionStorage.getItem(notifKey)) {
            sessionStorage.setItem(notifKey, '1');
            dispatchGentleBrowserNotification(
              `Care Ping from ${ping.senderLabel}`,
              ping.message,
              data.settings.disguiseMode,
            );
          }
        }
      }
    };
    void pollCare();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void pollCare();
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    ready,
    locked,
    partnerShareConfig.enabled,
    partnerShareConfig.code,
    partnerShareConfig.pin,
    partnerShareConfig.writeSecret,
    partnerShareConfig.syncServerUrl,
    data.settings.disguiseMode,
  ]);

  // Handle Android / PWA App Icon Long-Press Shortcuts (?action=...) & Partner Deep-Link (?partner=CODE)
  const shortcutHandledRef = useRef(false);
  useEffect(() => {
    if (!ready || locked || shortcutHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const partnerCodeParam = params.get('partner');
    if (!action && !partnerCodeParam) return;
    shortcutHandledRef.current = true;
    params.delete('action');
    params.delete('partner');
    const cleanUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', cleanUrl);

    if (partnerCodeParam) {
      const clean = partnerCodeParam.replace(/\s+/g, '').toUpperCase();
      if (/^[A-Z0-9]{6}$/.test(clean)) {
        setPrefillPartnerCode(clean);
        setActiveTab('partner');
        showToast(`Partner Code ${clean} pre-filled — tap Connect Live!`);
        return;
      }
    }

    if (action === 'log-period') {
      handleQuickTogglePeriodToday();
    } else if (action === 'take-pill') {
      if (!data.settings.pillPack.takenDates.includes(today)) {
        handleTogglePillDate(today);
      } else {
        showToast('Today’s pill is already marked taken.');
      }
    } else if (action === 'log-symptoms') {
      setLogDialogDate(today);
    }
  }, [ready, locked]);

  // Partner Auto-Refresh every 60s when connected to a partner
  useEffect(() => {
    if (!ready || locked || !partnerWatchConfig) return;
    let cancelled = false;

    const refresh = async () => {
      const res = await fetchPartnerSnapshot(partnerWatchConfig);
      if (cancelled) return;
      if (!res.snapshot) {
        if (res.pinRequired) {
          setPartnerPinAuthError(true);
        }
        return;
      }
      setPartnerPinAuthError(false);
      setWatchedPartnerSnapshot(res.snapshot);
      void saveCachedPartnerSnapshotToVault(res.snapshot);

      // Fire immediate symptom/phase care cue ONLY if snapshot is from today (prevents daily re-alerts on stale snapshots)
      if (partnerWatchConfig.alertsOnThisPhone && res.snapshot.asOfDate === today) {
        const immediate = buildImmediatePartnerCareAlert(res.snapshot);
        if (immediate) {
          const key = `luna_partner_care_${res.snapshot.asOfDate}_${immediate.id}`;
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, '1');
            dispatchGentleBrowserNotification(
              immediate.title,
              immediate.body,
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

  // Keep native Android OS Partner Care Notifications in sync (cancels immediately on disconnect or toggle OFF, reschedules immediately on time change)
  useEffect(() => {
    if (!ready || locked) return;
    void syncNativePartnerNotifications(
      watchedPartnerSnapshot,
      partnerWatchConfig,
      data.settings.disguiseMode,
      data.settings.reminders.customNotificationText,
    );
  }, [
    ready,
    locked,
    watchedPartnerSnapshot,
    partnerWatchConfig?.alertsOnThisPhone,
    partnerWatchConfig?.dailyCheckinTime,
    partnerWatchConfig?.code,
    data.settings.disguiseMode,
    data.settings.reminders.customNotificationText,
  ]);

  // Sync native Android OS notifications whenever logs/settings/summary change inside the APK
  useEffect(() => {
    if (!ready || locked) return;
    void syncNativeScheduledNotifications(data, summary, latestPeriodStartDate);
  }, [ready, locked, data, summary, latestPeriodStartDate]);

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
    const isEmpty = log.flow === 'none' && !hasNonFlowLogDetails(log);

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
    const isNowEmpty = updatedLog.flow === 'none' && !hasNonFlowLogDetails(updatedLog);

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
      pillPack: patch.pillPack
        ? { ...data.settings.pillPack, ...patch.pillPack }
        : data.settings.pillPack,
      reminders: patch.reminders
        ? { ...data.settings.reminders, ...patch.reminders }
        : data.settings.reminders,
    };
    void persistData({ ...data, settings: nextSettings });
    if (pinConfig?.enabled && (patch.disguiseMode !== undefined || patch.theme !== undefined)) {
      const updatedPinCfg: PinLockConfig = {
        ...pinConfig,
        disguiseMode: nextSettings.disguiseMode,
        theme: nextSettings.theme,
      };
      setPinConfig(updatedPinCfg);
      void savePinConfig(updatedPinCfg);
    }
  };

  const handleStartHygieneTimer = (product: SanitaryProductType) => {
    const timer = createHygieneTimer(product);
    handleUpdateSettings({ activeHygieneTimer: timer });
    void scheduleNativeHygieneNotification(
      timer,
      data.settings.disguiseMode,
      data.settings.reminders.customNotificationText,
    );
    showToast(`Started ${timer.durationHours}h ${product} timer.`);
  };

  const handleLogHygieneChange = (restart: boolean) => {
    const active = data.settings.activeHygieneTimer;
    if (!active) return;
    const meta = getProductMeta(active.product);
    const existing = data.logs[today] ?? createEmptyLog(today);
    const nextChanges = [
      ...(existing.hygieneChanges ?? []),
      {
        product: active.product,
        changedAt: new Date().toISOString(),
        estimatedMl: meta.estimatedMl,
      },
    ];
    const nextTimer = restart ? createHygieneTimer(active.product, active.durationHours) : null;
    const nextData: LunaData = {
      ...data,
      logs: {
        ...data.logs,
        [today]: { ...existing, hygieneChanges: nextChanges },
      },
      settings: {
        ...data.settings,
        activeHygieneTimer: nextTimer,
      },
    };
    void persistData(nextData);
    void scheduleNativeHygieneNotification(
      nextTimer,
      data.settings.disguiseMode,
      data.settings.reminders.customNotificationText,
    );
    showToast(
      restart
        ? `Logged ~${meta.estimatedMl} mL change and restarted ${active.durationHours}h timer.`
        : `Logged ~${meta.estimatedMl} mL change.`,
    );
  };

  const handleStopHygieneTimer = () => {
    handleUpdateSettings({ activeHygieneTimer: null });
    void scheduleNativeHygieneNotification(null, data.settings.disguiseMode, '');
    showToast('Hygiene timer stopped.');
  };

  const buildPillRingTarget = (scheduledTime: string, isTest = false): ActivePillRing => {
    const status = computePillPackStatus(data.settings.pillPack, today, latestPeriodStartDate);
    return {
      key: `pill:${today}:${scheduledTime}${isTest ? ':test' : ''}`,
      scheduledTime,
      dayInPack: status.dayInPack,
      totalPills: status.totalPills,
      pillsPerDay: status.pillsPerDay,
      pillsRemaining: status.pillsRemaining,
      needsRefill: status.needsRefill,
      isTest,
    };
  };

  // Start/stop MedClock-style looping PCM WAV audio + vibration whenever activePillRing changes
  useEffect(() => {
    if (!activePillRing) {
      pillAlarmAudio.stop();
      return;
    }
    pillAlarmAudio.startLoop(data.settings.pillPack.alarmTone ?? 'temple_chime', 0.95, true);
    return () => {
      pillAlarmAudio.stop();
    };
  }, [activePillRing, data.settings.pillPack.alarmTone]);

  // Jump straight to full-screen PillRingingModal when user taps native Android pill alarm notification
  useEffect(() => {
    if (!ready || locked) return;
    return subscribeNativePillAlarmTap((scheduledTime) => {
      const fallbackTime = getPillReminderTimes(data.settings.pillPack)[0] ?? '21:00';
      setActivePillRing(buildPillRingTarget(scheduledTime || fallbackTime, false));
    });
  }, [ready, locked, data.settings.pillPack, today, latestPeriodStartDate]);

  // MedClock-style 1-second foreground alarm scheduler (1..4 daily reminder times + 2-min catch-up + snooze)
  useEffect(() => {
    if (
      !ready ||
      locked ||
      data.settings.simpleMode ||
      !data.settings.pillPack.enabled ||
      !(data.settings.pillPack.alarmEnabled ?? true)
    ) {
      setActivePillRing((prev) => (prev?.isTest ? prev : null));
      return;
    }

    const CATCH_UP_WINDOW_MS = 2 * 60 * 1000;

    const tick = () => {
      const pillStatus = computePillPackStatus(data.settings.pillPack, today, latestPeriodStartDate);
      if (pillStatus.takenToday || pillStatus.startsInDays > 0) {
        setActivePillRing((prev) => (prev?.isTest ? prev : null));
        return;
      }

      const now = new Date();
      const nowMs = now.getTime();

      if (pillSnooze && nowMs >= pillSnooze.wakeAtMs) {
        const sched = pillSnooze.scheduledTime;
        setPillSnooze(null);
        setActivePillRing(buildPillRingTarget(sched, false));
        const dose = pillStatus.pillsPerDay === 1 ? '1 pill' : `${pillStatus.pillsPerDay} pills`;
        dispatchGentleBrowserNotification(
          'Daily Pill Alarm (Snoozed)',
          `Time to take your daily dose (${dose}).`,
          data.settings.disguiseMode,
        );
        return;
      }

      for (const timeStr of getPillReminderTimes(data.settings.pillPack)) {
        const [h, m] = timeStr.split(':').map(Number);
        if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
        const target = new Date(now);
        target.setHours(h, m, 0, 0);
        const elapsed = nowMs - target.getTime();
        if (elapsed < 0 || elapsed > CATCH_UP_WINDOW_MS) continue;

        const key = `${today}:${timeStr}`;
        if (firedPillAlarmKeysRef.current.has(key)) continue;
        firedPillAlarmKeysRef.current.add(key);

        setActivePillRing(buildPillRingTarget(timeStr, false));
        const dose = pillStatus.pillsPerDay === 1 ? '1 pill' : `${pillStatus.pillsPerDay} pills`;
        dispatchGentleBrowserNotification(
          'Daily Pill Alarm',
          `Time to take your daily dose (${dose}) — ${timeStr}.`,
          data.settings.disguiseMode,
        );
        break;
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    const onResume = () => tick();
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
    };
  }, [
    ready,
    locked,
    today,
    latestPeriodStartDate,
    data.settings.simpleMode,
    data.settings.disguiseMode,
    data.settings.pillPack,
    pillSnooze,
  ]);

  const handleStartNewPillPack = () => {
    handleUpdateSettings({
      pillPack: {
        ...data.settings.pillPack,
        startMode: 'date',
        packStartDate: today,
      },
    });
    showToast('Started a fresh pill pack from today.');
  };

  const handleTogglePillDate = (date: string) => {
    const current = data.settings.pillPack.takenDates;
    const exists = current.includes(date);
    const nextTaken = exists ? current.filter((d) => d !== date) : [...current, date];
    const nextLate = exists
      ? (data.settings.pillPack.lateDates ?? []).filter((d) => d !== date)
      : data.settings.pillPack.lateDates ?? [];
    handleUpdateSettings({
      pillPack: {
        ...data.settings.pillPack,
        takenDates: nextTaken,
        lateDates: nextLate,
      },
    });
    if (date === today) {
      if (!exists) {
        pillAlarmAudio.stop();
        pillAlarmAudio.playSuccessChime();
        setActivePillRing(null);
        setPillSnooze(null);
      }
      showToast(exists ? 'Unmarked pill for today.' : 'Marked today’s pill taken.');
    }
  };

  const handleMarkPillLate = (date: string) => {
    const nextTaken = data.settings.pillPack.takenDates.includes(date)
      ? data.settings.pillPack.takenDates
      : [...data.settings.pillPack.takenDates, date];
    const currentLate = data.settings.pillPack.lateDates ?? [];
    const nextLate = currentLate.includes(date) ? currentLate : [...currentLate, date];
    handleUpdateSettings({
      pillPack: {
        ...data.settings.pillPack,
        takenDates: nextTaken,
        lateDates: nextLate,
      },
    });
    if (date === today) {
      pillAlarmAudio.stop();
      setActivePillRing(null);
      setPillSnooze(null);
    }
    showToast(`Marked pill for ${date === today ? 'today' : date} as taken late.`);
  };

  const handleDismissCarePing = () => {
    if (incomingCarePing) {
      localStorage.setItem('luna_dismissed_care_ping_id', incomingCarePing.id);
    }
    setIncomingCarePing(null);
    void clearPartnerCarePing(partnerShareConfig);
  };

  const handleTriggerTestPillAlarm = () => {
    void pillAlarmAudio.unlock();
    const primaryTime = getPillReminderTimes(data.settings.pillPack)[0] ?? '21:00';
    setActivePillRing(buildPillRingTarget(primaryTime, true));
  };

  const handleAddCustomSymptom = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || data.settings.customSymptoms.includes(trimmed)) return;
    handleUpdateSettings({
      customSymptoms: [...data.settings.customSymptoms, trimmed],
    });
  };

  const handleAddCustomMood = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || data.settings.customMoods.includes(trimmed)) return;
    handleUpdateSettings({
      customMoods: [...data.settings.customMoods, trimmed],
    });
  };

  const handleSetPin = async (pin: string) => {
    await clearBiometricCredentials();
    const cfg = await createPinConfig(pin, true);
    cfg.disguiseMode = data.settings.disguiseMode;
    cfg.theme = data.settings.theme;
    await savePinConfig(cfg);
    await saveLunaData(data, pin);
    setPinConfig(cfg);
    setActivePin(pin);
    showToast('PIN lock enabled & vault encrypted.');
  };

  const handleBiometricUnlock = async (): Promise<boolean> => {
    const pinFromKeystore = await unlockVaultWithBiometric(data.settings.disguiseMode);
    if (!pinFromKeystore) return false;
    return handleUnlock(pinFromKeystore);
  };

  const handleToggleBiometric = async (enabled: boolean) => {
    if (!pinConfig?.enabled || !activePin) {
      showToast('Set a 4-digit PIN first to enable biometric unlock.');
      return;
    }
    if (enabled) {
      const res = await enableBiometricForVault(activePin, data.settings.disguiseMode);
      if (!res.ok) {
        showToast(res.error ?? 'Could not enable biometric unlock.');
        return;
      }
      const nextCfg: PinLockConfig = { ...pinConfig, biometricEnabled: true };
      await savePinConfig(nextCfg);
      setPinConfig(nextCfg);
      showToast(`${biometricInfo.label} unlock enabled.`);
    } else {
      await clearBiometricCredentials();
      const nextCfg: PinLockConfig = { ...pinConfig, biometricEnabled: false };
      await savePinConfig(nextCfg);
      setPinConfig(nextCfg);
      showToast(`${biometricInfo.label} unlock disabled.`);
    }
  };

  const handleRemovePin = async () => {
    await clearBiometricCredentials();
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

  const handleImportExternalFile = (fileText: string) => {
    const res = importExternalHistory(fileText, data.logs);
    if ('error' in res) {
      showToast(res.error);
      return;
    }
    void persistData({ ...data, logs: res.mergedLogs });
    showToast(`Imported ${res.importedDays} period days from ${res.source.toUpperCase()}!`);
  };

  const handleLoadSampleData = () => {
    const sample = buildSampleDemoData(today);
    sample.settings.disguiseMode = data.settings.disguiseMode;
    void persistData(sample);
    showToast('Loaded 4 realistic sample cycles.');
  };

  const handleEraseAllData = async () => {
    await clearBiometricCredentials();
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
        biometricEnabled={Boolean(pinConfig?.biometricEnabled && biometricInfo.available)}
        biometricLabel={biometricInfo.label}
        onUnlock={handleUnlock}
        onBiometricUnlock={handleBiometricUnlock}
      />
    );
  }

  const disguised = data.settings.disguiseMode;
  const t = getUiStrings(data.settings.language);

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
              {t.onDevice}
            </span>
          )}
        </div>
      </header>

      <main className="app-main">
        {otaState.updateAvailable ? (
          <div
            className="reminder-item reminder-item--gentle"
            role="status"
            style={{ alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
          >
            <div>
              <p className="reminder-title">
                Live OTA update ready{otaState.latestVersion ? ` (v${otaState.latestVersion})` : ''}
              </p>
              <p className="reminder-body">
                Refresh in place — your local logs stay untouched.
              </p>
            </div>
            <button
              type="button"
              className="btn-primary"
              style={{ minHeight: 40, padding: '8px 14px', fontSize: '0.82rem', flexShrink: 0 }}
              onClick={() => void applyOtaUpdateNow()}
            >
              Update Now
            </button>
          </div>
        ) : null}

        {activeTab === 'today' ? (
          <TodayView
            data={data}
            stats={stats}
            summary={summary}
            reminders={activeReminders}
            incomingCarePing={incomingCarePing}
            onDismissCarePing={handleDismissCarePing}
            onQuickTogglePeriodToday={handleQuickTogglePeriodToday}
            onOpenLogDialog={(d) => setLogDialogDate(d)}
            onLoadSampleData={handleLoadSampleData}
            onJumpToCalendarEdit={() => {
              setCalendarEditInit(true);
              setActiveTab('calendar');
            }}
            onStartHygieneTimer={handleStartHygieneTimer}
            onLogHygieneChange={handleLogHygieneChange}
            onStopHygieneTimer={handleStopHygieneTimer}
            onTogglePillDate={handleTogglePillDate}
            onMarkPillLate={handleMarkPillLate}
            onStartNewPillPack={handleStartNewPillPack}
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
            prefillPartnerCode={prefillPartnerCode}
            pinAuthError={partnerPinAuthError}
            onClearPinAuthError={() => setPartnerPinAuthError(false)}
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
            latestPeriodStartDate={latestPeriodStartDate}
            otaState={otaState}
            biometricAvailable={biometricInfo.available}
            biometricLabel={biometricInfo.label}
            onCheckOtaUpdate={() => void handleCheckOtaUpdate(true)}
            onApplyOtaUpdate={() => void applyOtaUpdateNow()}
            onUpdateSettings={handleUpdateSettings}
            onSetPin={handleSetPin}
            onRemovePin={handleRemovePin}
            onToggleBiometric={handleToggleBiometric}
            onExportJson={async (pass) => {
              await exportJsonBackup(data, today, pass);
              showToast(pass?.trim() ? 'Encrypted backup downloaded.' : 'JSON backup downloaded.');
            }}
            onImportJsonText={handleImportJsonText}
            onImportExternalFile={handleImportExternalFile}
            onExportCsv={() => {
              exportCsvLogs(data, today);
              showToast('CSV logs exported.');
            }}
            onExportDoctorPdf={handleExportDoctorPdf}
            onLoadSampleData={handleLoadSampleData}
            onEraseAllData={handleEraseAllData}
            onTriggerTestPillAlarm={handleTriggerTestPillAlarm}
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
          <span>{t.navToday}</span>
        </button>
        <button
          type="button"
          className="nav-tab"
          aria-current={activeTab === 'calendar' ? 'page' : undefined}
          onClick={() => setActiveTab('calendar')}
        >
          <Calendar size={19} />
          <span>{t.navCalendar}</span>
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
          <span>{t.navPartner}</span>
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
          <span>{t.navInsights}</span>
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
          <span>{t.navSettings}</span>
        </button>
      </nav>

      <DailyLogDialog
        open={logDialogDate !== null}
        date={logDialogDate}
        existingLog={logDialogDate ? data.logs[logDialogDate] : undefined}
        tempUnit={data.settings.tempUnit}
        mode={data.settings.mode}
        simpleMode={data.settings.simpleMode}
        customSymptoms={data.settings.customSymptoms}
        customMoods={data.settings.customMoods}
        onAddCustomSymptom={handleAddCustomSymptom}
        onAddCustomMood={handleAddCustomMood}
        onSave={handleSaveLog}
        onDelete={handleDeleteLog}
        onClose={() => setLogDialogDate(null)}
      />

      <PillRingingModal
        ring={activePillRing}
        onMarkTaken={() => {
          if (activePillRing?.isTest) {
            pillAlarmAudio.stop();
            setActivePillRing(null);
            showToast('Test pill alarm stopped.');
          } else {
            handleTogglePillDate(today);
          }
        }}
        onSnooze={(minutes) => {
          const sched = activePillRing?.scheduledTime ?? '21:00';
          pillAlarmAudio.stop();
          setActivePillRing(null);
          setPillSnooze({ wakeAtMs: Date.now() + minutes * 60_000, scheduledTime: sched });
          void scheduleNativePillSnooze(
            minutes,
            sched,
            data.settings.pillPack.pillsPerDay ?? 1,
            data.settings.disguiseMode,
            data.settings.reminders.customNotificationText,
          );
          showToast(`Pill alarm snoozed for ${minutes} minutes.`);
        }}
        onDismiss={() => {
          pillAlarmAudio.stop();
          setActivePillRing(null);
        }}
      />

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
