import { useEffect, useState } from 'react';
import {
  Baby,
  BellRing,
  Calendar,
  Check,
  Copy,
  Droplets,
  Eye,
  EyeOff,
  Heart,
  HeartHandshake,
  Link2,
  Pill,
  RefreshCw,
  Send,
  Share2,
  Shield,
  Sparkles,
  Trash2,
  Unlink,
  Users,
} from 'lucide-react';
import {
  FLOW_LABEL_MAP,
  MOOD_LABEL_MAP,
  PHASE_INFO,
  SYMPTOM_LABEL_MAP,
} from '../engine/catalog';
import {
  requestNativeNotificationPermission,
  sendTestPartnerCareNotification,
} from '../engine/nativeNotifications';
import {
  buildImmediatePartnerCareAlert,
  buildScheduledPartnerCareAlerts,
} from '../engine/partnerNotifications';
import {
  buildPartnerSnapshot,
  buildPartnerTextSummary,
  DEFAULT_PARTNER_SYNC_URL,
  deletePartnerSnapshot,
  fetchPartnerSnapshot,
  generatePartnerCode,
  getPartnerDailyBodyForecast,
  getPartnerKeyUpcomingDates,
  getPartnerSupportTips,
  hashPartnerPin,
  pushPartnerCarePing,
  pushPartnerSnapshot,
} from '../engine/partnerSync';
import { daysBetween, formatShortDate, formatWeekdayShort, getDayOfMonth } from '../engine/temporal';
import type {
  CycleStats,
  LunaData,
  PartnerShareConfig,
  PartnerSnapshot,
  PartnerWatchConfig,
  TodaySummary,
} from '../types';
import { PartnerDiscoverSection } from './PartnerDiscoverSection';

interface PartnerViewProps {
  data: LunaData;
  stats: CycleStats;
  summary: TodaySummary;
  shareConfig: PartnerShareConfig;
  onUpdateShareConfig: (cfg: PartnerShareConfig) => void;
  watchConfig: PartnerWatchConfig | null;
  onUpdateWatchConfig: (cfg: PartnerWatchConfig | null) => void;
  watchedSnapshot: PartnerSnapshot | null;
  onUpdateWatchedSnapshot: (snap: PartnerSnapshot | null) => void;
  prefillPartnerCode?: string | null;
  pinAuthError?: boolean;
  onClearPinAuthError?: () => void;
  onNotify: (msg: string) => void;
}

const NEED_BEACON_OPTIONS = [
  "I'd love a hug",
  'Need quiet space',
  'Bring warm tea / snacks',
  'Low battery today',
  'Feeling great!',
];

const COMFORT_PRESET_OPTIONS = [
  'Warm tea / chai',
  'Heating pad',
  'Dark chocolate',
  'Quiet evening',
  'Back / foot rub',
  'Handle dinner',
];

export function PartnerView({
  data,
  stats,
  summary,
  shareConfig,
  onUpdateShareConfig,
  watchConfig,
  onUpdateWatchConfig,
  watchedSnapshot,
  onUpdateWatchedSnapshot,
  prefillPartnerCode,
  pinAuthError = false,
  onClearPinAuthError,
  onNotify,
}: PartnerViewProps) {
  const [activeRoleTab, setActiveRoleTab] = useState<'watch' | 'share'>(() =>
    prefillPartnerCode ? 'watch' : shareConfig.enabled && !watchConfig ? 'share' : 'watch',
  );
  const [pinInput, setPinInput] = useState('');
  const [showSharePin, setShowSharePin] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [syncingShare, setSyncingShare] = useState(false);

  const [connectCode, setConnectCode] = useState(prefillPartnerCode || watchConfig?.code || '');
  const [connectPin, setConnectPin] = useState('');
  const [recoveryPin, setRecoveryPin] = useState('');
  const [connectUrl, setConnectUrl] = useState(
    watchConfig?.syncServerUrl || shareConfig.syncServerUrl || DEFAULT_PARTNER_SYNC_URL,
  );
  const [watchStatus, setWatchStatus] = useState<string | null>(null);
  const [loadingWatch, setLoadingWatch] = useState(false);
  const [carePingInput, setCarePingInput] = useState('');
  const [sendingCarePing, setSendingCarePing] = useState(false);
  const [selectedForecastDay, setSelectedForecastDay] = useState<{ date: string; phase: PartnerSnapshot['phase'] } | null>(null);

  useEffect(() => {
    if (prefillPartnerCode) {
      setConnectCode(prefillPartnerCode);
      setActiveRoleTab('watch');
    }
  }, [prefillPartnerCode]);

  const CARE_PING_PRESETS = [
    'Picking up a heating pad or warm tea — need anything?',
    'Thinking of you today — take it easy tonight',
    'Dinner is on me tonight — relax and rest',
    'Want me to grab dark chocolate or your favorite snacks?',
  ];

  const handleSendCarePing = async (msg: string) => {
    if (!watchConfig) return;
    setSendingCarePing(true);
    const sender = watchConfig.partnerName?.trim() || 'Your Partner';
    const res = await pushPartnerCarePing(watchConfig, msg, sender);
    setSendingCarePing(false);
    if (res.ok) {
      setCarePingInput('');
      onNotify('Encrypted care ping sent!');
    } else {
      onNotify(res.error || 'Could not send care ping.');
    }
  };

  const handleCopyInvite = async () => {
    const inviteUrl = `https://jee1vk.github.io/lunacycle-app/?partner=${shareConfig.code}`;
    const pinLine = shareConfig.pin ? `\nPIN: ${shareConfig.pin}` : '';
    const text = `Join my private LunaCycle Partner View:\n${inviteUrl}\nPartner Code: ${shareConfig.code}${pinLine}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setShareStatus('Invite link, code & PIN copied — paste in WhatsApp or SMS!');
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setShareStatus(`Code: ${shareConfig.code}${shareConfig.pin ? ` · PIN: ${shareConfig.pin}` : ''}`);
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(shareConfig.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setShareStatus(`Partner Code: ${shareConfig.code}`);
    }
  };

  const handleShareWhatsApp = async () => {
    const snap = buildPartnerSnapshot(shareConfig, data, stats, summary);
    const text = buildPartnerTextSummary(snap);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'LunaCycle Partner Update', text });
        return;
      } catch {
        // User dismissed or unsupported -> fall back to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareStatus('Summary copied — paste directly into WhatsApp or SMS!');
    } catch {
      setShareStatus(text);
    }
  };

  const handleSyncNow = async (overrideCfg?: PartnerShareConfig) => {
    const cfg = overrideCfg ?? shareConfig;
    if (!cfg.syncServerUrl.trim()) {
      setShareStatus('Add a Sync Relay URL below to push live updates.');
      return;
    }
    setSyncingShare(true);
    setShareStatus('Syncing live…');
    const snap = buildPartnerSnapshot(cfg, data, stats, summary);
    const res = await pushPartnerSnapshot(cfg, snap);
    setSyncingShare(false);
    if (res.ok) {
      const updated: PartnerShareConfig = {
        ...cfg,
        enabled: true,
        lastSyncedAt: new Date().toISOString(),
      };
      onUpdateShareConfig(updated);
      setShareStatus('Synced live! Future updates will sync automatically.');
    } else {
      setShareStatus(`Sync failed: ${res.error}`);
    }
  };

  const handleRotateCode = async () => {
    // Wipe previous code from relay first so old code stops working immediately
    if (shareConfig.enabled) {
      await deletePartnerSnapshot(shareConfig);
    }
    const nextCfg: PartnerShareConfig = {
      ...shareConfig,
      code: generatePartnerCode(6),
      lastSyncedAt: undefined,
    };
    onUpdateShareConfig(nextCfg);
    setShareStatus('Generated a fresh Partner Code and revoked the previous one.');
    if (nextCfg.enabled) {
      void handleSyncNow(nextCfg);
    }
  };

  const handleStopAndWipe = async () => {
    setSyncingShare(true);
    const res = await deletePartnerSnapshot(shareConfig);
    setSyncingShare(false);
    onUpdateShareConfig({ ...shareConfig, enabled: false, lastSyncedAt: undefined });
    setShareStatus(
      res.ok
        ? 'Live sharing paused and remote snapshot wiped from relay.'
        : 'Sharing disabled locally (relay could not be reached right now).',
    );
  };

  const handleConnect = async () => {
    const cleanCode = connectCode.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(cleanCode)) {
      setWatchStatus('Enter a valid 6-character Partner Code.');
      return;
    }
    if (!connectUrl.trim()) {
      setWatchStatus('Enter the Sync Relay URL first.');
      return;
    }
    setLoadingWatch(true);
    setWatchStatus(null);
    const cleanPin = connectPin.trim() || undefined;
    const pinHash = cleanPin ? await hashPartnerPin(cleanPin) : undefined;
    const nextWatch: PartnerWatchConfig = {
      code: cleanCode,
      pin: cleanPin,
      pinHash,
      syncServerUrl: connectUrl.trim(),
      partnerName: watchConfig?.partnerName ?? '',
      alertsOnThisPhone: watchConfig?.alertsOnThisPhone ?? true,
      dailyCheckinTime: watchConfig?.dailyCheckinTime ?? '18:30',
      lastFetchedAt: new Date().toISOString(),
    };
    const res = await fetchPartnerSnapshot(nextWatch);
    setLoadingWatch(false);
    if (res.snapshot) {
      onUpdateWatchConfig(nextWatch);
      onUpdateWatchedSnapshot(res.snapshot);
      onClearPinAuthError?.();
      setWatchStatus(`Connected live to ${res.snapshot.profileLabel}.`);
      onNotify(`Connected to ${res.snapshot.profileLabel}`);
    } else {
      setWatchStatus(
        res.pinRequired ? 'PIN required or incorrect.' : (res.error ?? 'Could not connect.'),
      );
    }
  };

  const handleInlinePinRecovery = async () => {
    if (!watchConfig) return;
    const cleanPin = recoveryPin.trim() || undefined;
    const pinHash = cleanPin ? await hashPartnerPin(cleanPin) : undefined;
    const updatedWatch: PartnerWatchConfig = {
      ...watchConfig,
      pin: cleanPin,
      pinHash,
      lastFetchedAt: new Date().toISOString(),
    };
    setLoadingWatch(true);
    const res = await fetchPartnerSnapshot(updatedWatch);
    setLoadingWatch(false);
    if (res.snapshot) {
      onUpdateWatchConfig(updatedWatch);
      onUpdateWatchedSnapshot(res.snapshot);
      onClearPinAuthError?.();
      setRecoveryPin('');
      setWatchStatus('PIN updated & synced live!');
    } else {
      setWatchStatus(res.pinRequired ? 'That PIN was incorrect — try again.' : (res.error ?? 'Could not sync.'));
    }
  };

  const handleRefreshWatch = async () => {
    if (!watchConfig) return;
    setLoadingWatch(true);
    const res = await fetchPartnerSnapshot(watchConfig);
    setLoadingWatch(false);
    if (res.snapshot) {
      onUpdateWatchedSnapshot(res.snapshot);
      onUpdateWatchConfig({ ...watchConfig, lastFetchedAt: new Date().toISOString() });
      onClearPinAuthError?.();
      setWatchStatus('Updated just now.');
    } else {
      setWatchStatus(
        res.pinRequired ? 'Partner updated their PIN — enter the new PIN below.' : (res.error ?? 'Could not refresh.'),
      );
    }
  };

  const supportTips = watchedSnapshot ? getPartnerSupportTips(watchedSnapshot) : [];
  const bodyForecast = watchedSnapshot ? getPartnerDailyBodyForecast(watchedSnapshot) : null;
  const keyUpcomingDates = watchedSnapshot ? getPartnerKeyUpcomingDates(watchedSnapshot) : [];
  const staleDays = watchedSnapshot ? Math.max(0, daysBetween(watchedSnapshot.asOfDate, summary.today)) : 0;

  return (
    <>
      {/* ROLE-AWARE TAB SWITCHER */}
      <div className="segmented" style={{ gridTemplateColumns: '1fr 1fr' }} role="tablist" aria-label="Partner mode">
        <button
          type="button"
          role="tab"
          aria-selected={activeRoleTab === 'watch'}
          aria-pressed={activeRoleTab === 'watch'}
          className="segmented-btn"
          onClick={() => setActiveRoleTab('watch')}
        >
          Partner View
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeRoleTab === 'share'}
          aria-pressed={activeRoleTab === 'share'}
          className="segmented-btn"
          onClick={() => setActiveRoleTab('share')}
        >
          Share My Cycle
        </button>
      </div>

      {activeRoleTab === 'watch' ? (
      <>
      {/* SECTION 1: CONNECT TO PARTNER (VIEW PARTNER'S LIVE UPDATES) */}
      <section className="card" aria-label="Connect to your partner">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={19} color="var(--color-brand-primary)" />
            <h2 className="section-title" style={{ margin: 0 }}>
              Partner View
            </h2>
          </div>
          {watchConfig ? (
            <button
              type="button"
              className="btn-secondary"
              style={{ minHeight: 38, padding: '6px 12px', fontSize: '0.8rem' }}
              onClick={() => {
                onUpdateWatchConfig(null);
                onUpdateWatchedSnapshot(null);
                setWatchStatus('Disconnected from partner.');
              }}
            >
              <Unlink size={14} />
              Disconnect
            </button>
          ) : null}
        </div>

        {!watchConfig || !watchedSnapshot ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p className="section-caption">
              Enter your partner&apos;s 6-character code to see their cycle phase, comfort cues, and upcoming dates privately.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label className="field-group">
                <span className="field-label">Partner Code</span>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="e.g. K7M9P2"
                  className="input-control tabular"
                  style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}
                  value={connectCode}
                  onChange={(e) => setConnectCode(e.target.value.toUpperCase())}
                />
              </label>
              <label className="field-group">
                <span className="field-label">PIN (If Set)</span>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Optional 4-digit"
                  className="input-control tabular"
                  value={connectPin}
                  onChange={(e) => setConnectPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
              </label>
            </div>

            <details>
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--color-brand-primary)',
                }}
              >
                Sync Relay Server (Pre-configured)
              </summary>
              <label className="field-group" style={{ marginTop: 8 }}>
                <span className="field-label">Cloudflare Worker URL</span>
                <input
                  type="url"
                  className="input-control"
                  value={connectUrl}
                  onChange={(e) => setConnectUrl(e.target.value)}
                />
              </label>
            </details>

            <button
              type="button"
              className="btn-primary"
              disabled={loadingWatch}
              onClick={() => void handleConnect()}
            >
              <HeartHandshake size={18} />
              {loadingWatch ? 'Connecting…' : 'Connect & View Live Updates'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Header Strip */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                  {watchedSnapshot.profileLabel}
                </div>
                <div className="section-caption">
                  Synced{' '}
                  {new Date(watchedSnapshot.updatedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  · {formatShortDate(watchedSnapshot.asOfDate)}
                </div>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Refresh partner updates"
                disabled={loadingWatch}
                onClick={() => void handleRefreshWatch()}
              >
                <RefreshCw size={18} />
              </button>
            </div>

            {/* Partner Current Phase / Pregnancy Summary Box */}
            {/* Inline PIN Recovery Banner if primary user changed PIN */}
            {pinAuthError ? (
              <div className="reminder-item reminder-item--period" style={{ flexDirection: 'column', gap: 8 }}>
                <div>
                  <p className="reminder-title">Partner PIN updated</p>
                  <p className="reminder-body">Enter the new 4-digit PIN (or leave blank if removed) to resume live sync.</p>
                </div>
                <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    className="input-control tabular"
                    placeholder="New 4-digit PIN"
                    value={recoveryPin}
                    onChange={(e) => setRecoveryPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ minHeight: 44, padding: '8px 14px', flexShrink: 0 }}
                    disabled={loadingWatch}
                    onClick={() => void handleInlinePinRecovery()}
                  >
                    Reconnect
                  </button>
                </div>
              </div>
            ) : null}

            {/* Stale-Sync Indicator */}
            {staleDays > 0 ? (
              <div className="reminder-item reminder-item--gentle" style={{ padding: '8px 12px' }}>
                <p className="reminder-body" style={{ margin: 0 }}>
                  <strong>Last synced {staleDays} {staleDays === 1 ? 'day' : 'days'} ago</strong> ({formatShortDate(watchedSnapshot.asOfDate)}). Symptoms shown are from that day until {watchedSnapshot.profileLabel} opens LunaCycle again.
                </p>
              </div>
            ) : null}

            {/* Today's Need Beacon (from primary user) */}
            {watchedSnapshot.todayNeedStatus ? (
              <div
                className="card-subtle"
                style={{
                  borderColor: 'var(--color-brand-accent)',
                  background: 'var(--color-brand-accent-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Heart size={18} color="var(--color-brand-primary)" style={{ flexShrink: 0 }} />
                <div>
                  <div className="metric-label" style={{ color: 'var(--color-brand-primary)' }}>
                    What {watchedSnapshot.profileLabel} Needs Today
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.96rem', color: 'var(--color-text-primary)', marginTop: 2 }}>
                    {watchedSnapshot.todayNeedStatus}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Opt-In Pill Refill Alert */}
            {watchedSnapshot.pillRefillNeeded ? (
              <div className="reminder-item reminder-item--period" style={{ alignItems: 'center' }}>
                <Pill size={16} style={{ flexShrink: 0 }} />
                <div>
                  <p className="reminder-title">Pill Pack Refill Due Soon</p>
                  <p className="reminder-body">
                    Only {watchedSnapshot.pillDaysRemaining ?? 0} days left in {watchedSnapshot.profileLabel}&apos;s current pack — offer to pick up a refill!
                  </p>
                </div>
              </div>
            ) : null}

            <div className="card-subtle" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span className={`phase-badge phase-badge--${watchedSnapshot.phase}`}>
                  {watchedSnapshot.mode === 'pregnancy' ? (
                    <Baby size={14} />
                  ) : watchedSnapshot.phase === 'ovulation' || watchedSnapshot.phase === 'fertile' ? (
                    <Sparkles size={14} />
                  ) : (
                    <Droplets size={14} />
                  )}
                  {watchedSnapshot.mode === 'pregnancy' && watchedSnapshot.pregnancy
                    ? `Pregnancy · Trimester ${watchedSnapshot.pregnancy.trimester}`
                    : PHASE_INFO[watchedSnapshot.phase].title}
                </span>
                {watchedSnapshot.cycleDay ? (
                  <span className="section-caption tabular" style={{ fontWeight: 600 }}>
                    Cycle Day {watchedSnapshot.cycleDay} of ~{watchedSnapshot.averageCycleLength}
                  </span>
                ) : null}
              </div>

              {watchedSnapshot.mode === 'pregnancy' && watchedSnapshot.pregnancy ? (
                <div>
                  <div className="metric-value tabular" style={{ fontSize: '1.5rem' }}>
                    {watchedSnapshot.pregnancy.weeks}w {watchedSnapshot.pregnancy.days}d
                  </div>
                  <div className="metric-sub tabular">
                    {watchedSnapshot.pregnancy.daysRemaining} days to due date (
                    {formatShortDate(watchedSnapshot.pregnancy.dueDate)})
                  </div>
                </div>
              ) : (
                <div className="metrics-grid">
                  <div className="metric-tile" style={{ padding: 10 }}>
                    <div className="metric-label">Period Status</div>
                    <div className="metric-value tabular" style={{ fontSize: '1.18rem' }}>
                      {watchedSnapshot.isPeriodActiveToday
                        ? 'Active Today'
                        : watchedSnapshot.daysLate > 0
                          ? `${watchedSnapshot.daysLate}d Past Due`
                          : watchedSnapshot.daysUntilNextPeriod !== null
                            ? `In ${watchedSnapshot.daysUntilNextPeriod}d`
                            : '—'}
                    </div>
                    <div className="metric-sub">
                      {watchedSnapshot.isPeriodActiveToday && watchedSnapshot.todayFlow
                        ? `${FLOW_LABEL_MAP[watchedSnapshot.todayFlow]} flow`
                        : watchedSnapshot.nextPeriodDate
                          ? `Expected ${formatShortDate(watchedSnapshot.nextPeriodDate)}`
                          : 'Waiting for baseline'}
                    </div>
                  </div>

                  {watchedSnapshot.ovulationDate && watchedSnapshot.fertileStartDate ? (
                    <div className="metric-tile" style={{ padding: 10 }}>
                      <div className="metric-label">Fertile Window</div>
                      <div className="metric-value tabular" style={{ fontSize: '1.12rem' }}>
                        {formatShortDate(watchedSnapshot.fertileStartDate)} –{' '}
                        {formatShortDate(
                          watchedSnapshot.fertileEndDate ?? watchedSnapshot.ovulationDate,
                        )}
                      </div>
                      <div className="metric-sub">
                        Peak {formatShortDate(watchedSnapshot.ovulationDate)}
                      </div>
                    </div>
                  ) : (
                    <div className="metric-tile" style={{ padding: 10 }}>
                      <div className="metric-label">Fertility Window</div>
                      <div className="metric-value" style={{ fontSize: '1.05rem' }}>
                        Private
                      </div>
                      <div className="metric-sub">Hidden by partner</div>
                    </div>
                  )}
                </div>
              )}

              {/* Shared Symptoms & Moods */}
              {(watchedSnapshot.todaySymptoms && watchedSnapshot.todaySymptoms.length > 0) ||
              (watchedSnapshot.todayCustomSymptoms && watchedSnapshot.todayCustomSymptoms.length > 0) ||
              (watchedSnapshot.todayMoods && watchedSnapshot.todayMoods.length > 0) ? (
                <div>
                  <div className="metric-label" style={{ marginBottom: 6 }}>
                    How {watchedSnapshot.profileLabel} Feels {staleDays > 0 ? `(${formatShortDate(watchedSnapshot.asOfDate)})` : 'Today'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {watchedSnapshot.todaySymptoms?.map((s) =>
                      SYMPTOM_LABEL_MAP[s] ? (
                        <span key={s} className="phase-badge phase-badge--menstrual">
                          {SYMPTOM_LABEL_MAP[s]}
                        </span>
                      ) : null,
                    )}
                    {watchedSnapshot.todayCustomSymptoms?.map((cs) => (
                      <span key={cs} className="phase-badge phase-badge--menstrual">
                        {cs}
                      </span>
                    ))}
                    {watchedSnapshot.todayMoods?.map((m) =>
                      MOOD_LABEL_MAP[m] ? (
                        <span key={m} className="phase-badge phase-badge--fertile">
                          {MOOD_LABEL_MAP[m]}
                        </span>
                      ) : null,
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Glanceable "Her Body & Energy Today" Meters */}
            {bodyForecast ? (
              <div className="card-subtle" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                  Her Body &amp; Energy Today
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[
                    { label: 'Energy', val: bodyForecast.energy, color: 'var(--color-brand-secondary)' },
                    { label: 'Sensitivity', val: bodyForecast.moodSensitivity, color: 'var(--color-brand-primary)' },
                    { label: 'Social', val: bodyForecast.socialBattery, color: 'var(--color-brand-accent)' },
                  ].map((m) => (
                    <div key={m.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 600, marginBottom: 4 }}>
                        <span>{m.label}</span>
                        <span className="tabular">{m.val}/5</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 9999, background: 'var(--color-border-subtle)', overflow: 'hidden' }}>
                        <div style={{ width: `${(m.val / 5) * 100}%`, height: '100%', background: m.color, borderRadius: 9999 }} />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="section-caption" style={{ lineHeight: 1.45 }}>
                  {bodyForecast.hormoneLine}
                </p>
              </div>
            ) : null}

            {/* Personal "What Helps Her Most" Comfort List */}
            {watchedSnapshot.comfortPreferences && watchedSnapshot.comfortPreferences.length > 0 ? (
              <div className="card-subtle">
                <div className="metric-label" style={{ marginBottom: 6 }}>
                  What Helps {watchedSnapshot.profileLabel} Most
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {watchedSnapshot.comfortPreferences.map((pref) => (
                    <span key={pref} className="phase-badge phase-badge--ovulation" style={{ fontSize: '0.74rem' }}>
                      {pref}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Empathetic Partner Support Tips */}
            <div className="card-subtle" style={{ borderLeft: '3px solid var(--color-brand-accent)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>
                How to Support Today
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.84rem', color: 'var(--color-text-secondary)' }}>
                {supportTips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </div>

            {/* Key Upcoming Dates Timeline */}
            {keyUpcomingDates.length > 0 ? (
              <div className="card-subtle" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={14} color="var(--color-brand-primary)" />
                  Key Upcoming Dates
                </div>
                {keyUpcomingDates.map((kd) => (
                  <div key={kd.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontSize: '0.82rem' }}>
                    <div>
                      <strong>{kd.label}</strong>
                      <div className="section-caption" style={{ fontSize: '0.74rem' }}>{kd.cue}</div>
                    </div>
                    <span className="phase-badge phase-badge--follicular tabular" style={{ flexShrink: 0, fontSize: '0.72rem' }}>
                      {formatShortDate(kd.date)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Interactive Tappable 14-Day Forecast Strip + Legend */}
            {watchedSnapshot.upcomingDays && watchedSnapshot.upcomingDays.length > 0 ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <div className="metric-label">Next 14 Days Forecast</div>
                  <span className="section-caption" style={{ fontSize: '0.72rem' }}>Tap any day</span>
                </div>
                <div className="week-strip" style={{ gap: 5 }}>
                  {watchedSnapshot.upcomingDays.map((item) => {
                    const isSelected = selectedForecastDay?.date === item.date;
                    const cls = [
                      'week-day-btn',
                      isSelected ? 'week-day-btn--today' : '',
                      item.phase === 'menstrual' ? 'week-day-btn--period' : '',
                      item.phase === 'predicted_period' ? 'week-day-btn--predicted' : '',
                      item.phase === 'ovulation'
                        ? 'week-day-btn--ovulation'
                        : item.phase === 'fertile'
                          ? 'week-day-btn--fertile'
                          : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <button
                        key={item.date}
                        type="button"
                        className={cls}
                        style={{ minHeight: 48 }}
                        onClick={() => setSelectedForecastDay(isSelected ? null : item)}
                        aria-label={`${formatShortDate(item.date)}: ${PHASE_INFO[item.phase].shortLabel}`}
                      >
                        <span className="week-day-letter">{formatWeekdayShort(item.date)}</span>
                        <span className="week-day-num tabular" style={{ fontSize: '0.82rem' }}>
                          {getDayOfMonth(item.date)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {selectedForecastDay ? (
                  <div className="card-subtle" style={{ marginTop: 8, padding: '8px 12px', fontSize: '0.82rem' }}>
                    <strong>{formatShortDate(selectedForecastDay.date)} — {PHASE_INFO[selectedForecastDay.phase].title}:</strong>{' '}
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      {PHASE_INFO[selectedForecastDay.phase].gentleCare}
                    </span>
                  </div>
                ) : null}
                <div className="cal-legend" style={{ marginTop: 8, paddingTop: 8 }}>
                  <span className="legend-item">
                    <span className="legend-swatch" style={{ background: 'var(--color-brand-primary)' }} />
                    Period
                  </span>
                  <span className="legend-item">
                    <span className="legend-swatch" style={{ background: 'var(--color-brand-primary-soft)', border: '1px dashed var(--color-brand-primary-mid)' }} />
                    Expected
                  </span>
                  {watchedSnapshot.ovulationDate ? (
                    <span className="legend-item">
                      <span className="legend-swatch" style={{ background: 'var(--color-brand-secondary-soft)' }} />
                      Fertile / Peak
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Partner Care Notifications (OS-level + Live Symptom Cues) */}
            <div className="card-subtle" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label className="setting-row" htmlFor="partner-alerts-switch" style={{ padding: 0, borderBottom: 'none' }}>
                <div className="setting-label-wrap">
                  <span className="setting-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <BellRing size={15} color="var(--color-brand-primary)" />
                    Partner Care Notifications
                  </span>
                  <span className="setting-desc">
                    Reminds you what to check on {watchedSnapshot.profileLabel} (PMS, period, symptoms &amp; evening check-in)
                  </span>
                </div>
                <input
                  id="partner-alerts-switch"
                  type="checkbox"
                  checked={watchConfig.alertsOnThisPhone}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    if (enabled) {
                      await requestNativeNotificationPermission();
                    }
                    onUpdateWatchConfig({
                      ...watchConfig,
                      alertsOnThisPhone: enabled,
                      dailyCheckinTime: watchConfig.dailyCheckinTime || '18:30',
                    });
                  }}
                  {...({ switch: '' } as Record<string, string>)}
                />
              </label>

              {watchConfig.alertsOnThisPhone ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <label htmlFor="partner-checkin-time" className="section-caption" style={{ fontWeight: 600 }}>
                      Daily Evening Check-In Time
                    </label>
                    <input
                      id="partner-checkin-time"
                      type="time"
                      className="input-control tabular"
                      style={{ width: 126, minHeight: 38 }}
                      value={watchConfig.dailyCheckinTime || '18:30'}
                      onChange={(e) =>
                        onUpdateWatchConfig({
                          ...watchConfig,
                          dailyCheckinTime: e.target.value || '18:30',
                        })
                      }
                    />
                  </div>

                  {buildScheduledPartnerCareAlerts(watchedSnapshot, summary.today).length > 0 ? (
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                      <strong>Upcoming care reminders:</strong>{' '}
                      {buildScheduledPartnerCareAlerts(watchedSnapshot, summary.today)
                        .map((a) => `${a.title}${a.scheduleDate ? ` (${formatShortDate(a.scheduleDate)})` : ''}`)
                        .join(' · ')}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ minHeight: 40, fontSize: '0.82rem' }}
                    onClick={async () => {
                      const sample = buildImmediatePartnerCareAlert(watchedSnapshot) ?? {
                        title: `Check in on ${watchedSnapshot.profileLabel}`,
                        body: 'Ask how her energy feels today and offer a warm drink or quiet evening together.',
                      };
                      const ok = await sendTestPartnerCareNotification(
                        sample.title,
                        sample.body,
                        data.settings.disguiseMode,
                        data.settings.reminders.customNotificationText,
                      );
                      onNotify(
                        ok
                          ? 'Test Partner Care notification sent!'
                          : 'Enable notifications in phone/browser settings to receive alerts.',
                      );
                    }}
                  >
                    <BellRing size={15} />
                    Send Test Care Notification
                  </button>
                </>
              ) : null}
            </div>

            {/* Two-Way Encrypted Partner Care Pings */}
            <div className="card-subtle" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <strong style={{ fontSize: '0.86rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Send size={14} color="var(--color-brand-primary)" />
                Send an Encrypted Care Ping
              </strong>
              <p className="section-caption">
                End-to-end encrypted — appears gently on {watchedSnapshot.profileLabel}&apos;s Today screen.
              </p>
              <label className="field-group">
                <span className="field-label" style={{ fontSize: '0.76rem' }}>Your Name (shown on her screen)</span>
                <input
                  type="text"
                  className="input-control"
                  style={{ minHeight: 38, fontSize: '0.85rem' }}
                  placeholder="e.g. Jeevan"
                  value={watchConfig.partnerName ?? ''}
                  onChange={(e) =>
                    onUpdateWatchConfig({ ...watchConfig, partnerName: e.target.value })
                  }
                />
              </label>
              <div className="chip-group">
                {CARE_PING_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="chip"
                    style={{ fontSize: '0.78rem', textAlign: 'left', height: 'auto', padding: '7px 11px' }}
                    disabled={sendingCarePing}
                    onClick={() => void handleSendCarePing(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  className="input-control"
                  maxLength={140}
                  placeholder="Write a short note..."
                  value={carePingInput}
                  onChange={(e) => setCarePingInput(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-primary"
                  style={{ minHeight: 44, padding: '8px 14px', flexShrink: 0 }}
                  disabled={sendingCarePing || !carePingInput.trim()}
                  onClick={() => void handleSendCarePing(carePingInput)}
                >
                  <Send size={15} />
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {watchStatus ? (
          <p style={{ margin: '10px 0 0', fontSize: '0.84rem', fontWeight: 600, color: 'var(--color-brand-primary)' }}>
            {watchStatus}
          </p>
        ) : null}
      </section>

      {/* DISCOVER STORIES, RECOMMENDED DECODER & PARTNER CYCLE ARTICLES */}
      <PartnerDiscoverSection
        watchedSnapshot={watchedSnapshot}
        fallbackPhase={summary.phase}
        today={summary.today}
        simpleMode={data.settings.simpleMode}
      />
      </>
      ) : (
      /* SECTION 2: SHARE MY CYCLE PRIVATELY */
      <section className="card" aria-label="Share my cycle privately">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={19} color="var(--color-brand-secondary)" />
            <h2 className="section-title" style={{ margin: 0 }}>
              Share My Cycle
            </h2>
          </div>
          <input
            aria-label="Enable live partner sharing"
            type="checkbox"
            checked={shareConfig.enabled}
            onChange={(e) => {
              const nextEnabled = e.target.checked;
              const nextCfg = { ...shareConfig, enabled: nextEnabled };
              onUpdateShareConfig(nextCfg);
              if (nextEnabled) {
                void handleSyncNow(nextCfg);
              } else {
                setShareStatus('Auto-sync paused. Tap "Stop & Wipe Relay" to delete remote copy.');
              }
            }}
            {...({ switch: '' } as Record<string, string>)}
          />
        </div>

        <p className="section-caption" style={{ marginBottom: 14 }}>
          Share a live read-only view with your partner using a 6-character code &amp; optional PIN. Private notes, BBT, LH tests, and intimacy logs are <strong>never</strong> shared.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className="field-group">
              <span className="field-label">Your Name / Label</span>
              <input
                type="text"
                className="input-control"
                placeholder="e.g. Priya"
                value={shareConfig.profileLabel}
                onChange={(e) =>
                  onUpdateShareConfig({ ...shareConfig, profileLabel: e.target.value })
                }
              />
            </label>

            <div className="field-group">
              <label className="field-label" htmlFor="partner-share-pin">
                Optional 4-Digit PIN
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  id="partner-share-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  className="input-control tabular"
                  placeholder={shareConfig.pinHash ? 'PIN active' : 'No PIN'}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ minHeight: 44, padding: '0 12px', fontSize: '0.82rem' }}
                  onClick={async () => {
                    const cleanPin = pinInput.trim() || undefined;
                    if (cleanPin && !/^\d{4}$/.test(cleanPin)) {
                      setShareStatus('Enter exactly 4 digits for the Partner PIN (or leave blank to clear).');
                      return;
                    }
                    const hashed = cleanPin ? await hashPartnerPin(cleanPin) : undefined;
                    const updated = { ...shareConfig, pin: cleanPin, pinHash: hashed };
                    onUpdateShareConfig(updated);
                    setPinInput('');
                    setShareStatus(hashed ? 'Partner PIN set (E2EE key updated).' : 'Partner PIN removed.');
                    if (updated.enabled) {
                      void handleSyncNow(updated);
                    }
                  }}
                >
                  Set
                </button>
              </div>
            </div>
          </div>

          {/* 6-Character Partner Code Card */}
          <div
            className="card-subtle"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div>
              <div className="metric-label">Your Partner Code</div>
              <div
                className="tabular"
                style={{
                  fontSize: '1.45rem',
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  color: 'var(--color-brand-primary)',
                }}
              >
                {shareConfig.code}
              </div>
              {shareConfig.pin ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span className="section-caption tabular">
                    PIN: <strong>{showSharePin ? shareConfig.pin : '••••'}</strong>
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ minHeight: 28, padding: '2px 8px', fontSize: '0.72rem' }}
                    onClick={() => setShowSharePin((v) => !v)}
                  >
                    {showSharePin ? <EyeOff size={12} /> : <Eye size={12} />}
                    {showSharePin ? 'Hide' : 'Show'}
                  </button>
                </div>
              ) : null}
              {shareConfig.lastSyncedAt ? (
                <div className="section-caption">
                  Last synced{' '}
                  {new Date(shareConfig.lastSyncedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              ) : null}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ minHeight: 42, padding: '8px 12px', fontSize: '0.82rem' }}
                onClick={() => void handleCopyInvite()}
              >
                {copied ? <Check size={15} /> : <Link2 size={15} />}
                {copied ? 'Copied' : 'Copy Invite'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ minHeight: 42, padding: '8px 12px', fontSize: '0.82rem' }}
                onClick={() => void handleCopyCode()}
              >
                <Copy size={15} />
                Code
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ minHeight: 42, padding: '8px 12px', fontSize: '0.82rem' }}
                onClick={() => void handleRotateCode()}
              >
                New Code
              </button>
            </div>
          </div>

          {/* 1-Tap "What I Need Today" Beacon */}
          <div className="card-subtle" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="metric-label">What I Need Today (1-Tap Beacon)</div>
            <div className="chip-group">
              {NEED_BEACON_OPTIONS.map((opt) => {
                const active = shareConfig.todayNeedStatus === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    className="chip"
                    aria-pressed={active}
                    style={{ fontSize: '0.8rem', minHeight: 38 }}
                    onClick={() =>
                      onUpdateShareConfig({
                        ...shareConfig,
                        todayNeedStatus: active ? '' : opt,
                      })
                    }
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Personal "What Helps Me" Comfort Preferences */}
          <div className="card-subtle" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="metric-label">What Helps Me Most (Shown to Partner)</div>
            <div className="chip-group">
              {COMFORT_PRESET_OPTIONS.map((pref) => {
                const list = shareConfig.comfortPreferences ?? [];
                const active = list.includes(pref);
                return (
                  <button
                    key={pref}
                    type="button"
                    className="chip chip--sage"
                    aria-pressed={active}
                    style={{ fontSize: '0.8rem', minHeight: 38 }}
                    onClick={() => {
                      const next = active ? list.filter((x) => x !== pref) : [...list, pref];
                      onUpdateShareConfig({ ...shareConfig, comfortPreferences: next });
                    }}
                  >
                    {pref}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Granular Privacy Permissions */}
          <div className="card-subtle" style={{ padding: '4px 14px' }}>
            <label className="setting-row" htmlFor="perm-fertile">
              <div className="setting-label-wrap">
                <span className="setting-title" style={{ fontSize: '0.88rem' }}>
                  Share Fertile &amp; Ovulation Window
                </span>
                <span className="setting-desc">Helpful for Trying to Conceive (TTC)</span>
              </div>
              <input
                id="perm-fertile"
                type="checkbox"
                checked={shareConfig.permissions.shareFertileWindow}
                onChange={(e) =>
                  onUpdateShareConfig({
                    ...shareConfig,
                    permissions: {
                      ...shareConfig.permissions,
                      shareFertileWindow: e.target.checked,
                    },
                  })
                }
                {...({ switch: '' } as Record<string, string>)}
              />
            </label>

            <label className="setting-row" htmlFor="perm-symptoms">
              <div className="setting-label-wrap">
                <span className="setting-title" style={{ fontSize: '0.88rem' }}>
                  Share Today&apos;s Symptoms &amp; Moods
                </span>
                <span className="setting-desc">Powers tailored partner support tips</span>
              </div>
              <input
                id="perm-symptoms"
                type="checkbox"
                checked={shareConfig.permissions.shareSymptomsAndMood}
                onChange={(e) =>
                  onUpdateShareConfig({
                    ...shareConfig,
                    permissions: {
                      ...shareConfig.permissions,
                      shareSymptomsAndMood: e.target.checked,
                    },
                  })
                }
                {...({ switch: '' } as Record<string, string>)}
              />
            </label>

            <label className="setting-row" htmlFor="perm-forecast">
              <div className="setting-label-wrap">
                <span className="setting-title" style={{ fontSize: '0.88rem' }}>
                  Share 14-Day Phase Forecast
                </span>
                <span className="setting-desc">Shows upcoming period &amp; fertile days</span>
              </div>
              <input
                id="perm-forecast"
                type="checkbox"
                checked={shareConfig.permissions.shareUpcomingForecast}
                onChange={(e) =>
                  onUpdateShareConfig({
                    ...shareConfig,
                    permissions: {
                      ...shareConfig.permissions,
                      shareUpcomingForecast: e.target.checked,
                    },
                  })
                }
                {...({ switch: '' } as Record<string, string>)}
              />
            </label>

            <label className="setting-row" htmlFor="perm-pill-refill">
              <div className="setting-label-wrap">
                <span className="setting-title" style={{ fontSize: '0.88rem' }}>
                  Share Pill Refill Heads-Up
                </span>
                <span className="setting-desc">Alerts partner only when your pack is low (never daily pill logs)</span>
              </div>
              <input
                id="perm-pill-refill"
                type="checkbox"
                checked={Boolean(shareConfig.permissions.sharePillRefillStatus)}
                onChange={(e) =>
                  onUpdateShareConfig({
                    ...shareConfig,
                    permissions: {
                      ...shareConfig.permissions,
                      sharePillRefillStatus: e.target.checked,
                    },
                  })
                }
                {...({ switch: '' } as Record<string, string>)}
              />
            </label>
          </div>

          {/* Action Buttons */}
          <div className="btn-row">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleShareWhatsApp()}
            >
              <Share2 size={16} />
              Share via WhatsApp / SMS
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={syncingShare}
              onClick={() => void handleSyncNow()}
            >
              <RefreshCw size={16} />
              {syncingShare ? 'Syncing…' : 'Sync Live Now'}
            </button>
          </div>

          {shareConfig.enabled || shareConfig.lastSyncedAt ? (
            <button
              type="button"
              className="btn-danger"
              disabled={syncingShare}
              onClick={() => void handleStopAndWipe()}
            >
              <Trash2 size={15} />
              Stop Sharing &amp; Wipe Relay Copy
            </button>
          ) : null}

          <details>
            <summary
              style={{
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--color-brand-primary)',
              }}
            >
              Cloud Sync Relay Settings (Free Cloudflare Worker)
            </summary>
            <label className="field-group" style={{ marginTop: 8 }}>
              <span className="field-label">Sync Relay URL</span>
              <input
                type="url"
                className="input-control"
                value={shareConfig.syncServerUrl}
                onChange={(e) =>
                  onUpdateShareConfig({ ...shareConfig, syncServerUrl: e.target.value })
                }
              />
            </label>
          </details>

          {shareStatus ? (
            <p style={{ margin: 0, fontSize: '0.84rem', fontWeight: 600, color: 'var(--color-brand-primary)' }}>
              {shareStatus}
            </p>
          ) : null}
        </div>
      </section>
      )}
    </>
  );
}
