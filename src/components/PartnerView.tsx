import { useState } from 'react';
import {
  Baby,
  BellRing,
  Check,
  Copy,
  Droplets,
  HeartHandshake,
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
  getPartnerSupportTips,
  hashPartnerPin,
  pushPartnerCarePing,
  pushPartnerSnapshot,
} from '../engine/partnerSync';
import { formatShortDate, formatWeekdayShort, getDayOfMonth } from '../engine/temporal';
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
  onNotify: (msg: string) => void;
}

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
  onNotify,
}: PartnerViewProps) {
  const [pinInput, setPinInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [syncingShare, setSyncingShare] = useState(false);

  const [connectCode, setConnectCode] = useState(watchConfig?.code ?? '');
  const [connectPin, setConnectPin] = useState('');
  const [connectUrl, setConnectUrl] = useState(
    watchConfig?.syncServerUrl || shareConfig.syncServerUrl || DEFAULT_PARTNER_SYNC_URL,
  );
  const [watchStatus, setWatchStatus] = useState<string | null>(null);
  const [loadingWatch, setLoadingWatch] = useState(false);
  const [carePingInput, setCarePingInput] = useState('');
  const [sendingCarePing, setSendingCarePing] = useState(false);

  const CARE_PING_PRESETS = [
    'Picking up a heating pad or warm tea — need anything?',
    'Thinking of you today — take it easy tonight',
    'Dinner is on me tonight — relax and rest',
    'Want me to grab dark chocolate or your favorite snacks?',
  ];

  const handleSendCarePing = async (msg: string) => {
    if (!watchConfig) return;
    setSendingCarePing(true);
    const res = await pushPartnerCarePing(watchConfig, msg, 'Your Partner');
    setSendingCarePing(false);
    if (res.ok) {
      setCarePingInput('');
      onNotify('Encrypted care ping sent!');
    } else {
      onNotify(res.error || 'Could not send care ping.');
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
    const cleanPin = connectPin.trim() || watchConfig?.pin;
    const pinHash = cleanPin ? await hashPartnerPin(cleanPin) : undefined;
    const nextWatch: PartnerWatchConfig = {
      code: cleanCode,
      pin: cleanPin,
      pinHash,
      syncServerUrl: connectUrl.trim(),
      alertsOnThisPhone: watchConfig?.alertsOnThisPhone ?? true,
      lastFetchedAt: new Date().toISOString(),
    };
    const res = await fetchPartnerSnapshot(nextWatch);
    setLoadingWatch(false);
    if (res.snapshot) {
      onUpdateWatchConfig(nextWatch);
      onUpdateWatchedSnapshot(res.snapshot);
      setWatchStatus(`Connected live to ${res.snapshot.profileLabel}.`);
      onNotify(`Connected to ${res.snapshot.profileLabel}`);
    } else {
      setWatchStatus(
        res.pinRequired ? 'PIN required or incorrect.' : (res.error ?? 'Could not connect.'),
      );
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
      setWatchStatus('Updated just now.');
    } else {
      setWatchStatus(res.error ?? 'Could not refresh.');
    }
  };

  const supportTips = watchedSnapshot ? getPartnerSupportTips(watchedSnapshot) : [];

  return (
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
              (watchedSnapshot.todayMoods && watchedSnapshot.todayMoods.length > 0) ? (
                <div>
                  <div className="metric-label" style={{ marginBottom: 6 }}>
                    How {watchedSnapshot.profileLabel} Feels Today
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {watchedSnapshot.todaySymptoms?.map((s) => (
                      <span key={s} className="phase-badge phase-badge--menstrual">
                        {SYMPTOM_LABEL_MAP[s]}
                      </span>
                    ))}
                    {watchedSnapshot.todayMoods?.map((m) => (
                      <span key={m} className="phase-badge phase-badge--fertile">
                        {MOOD_LABEL_MAP[m]}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

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

            {/* Upcoming 14-Day Forecast Strip (if shared) */}
            {watchedSnapshot.upcomingDays && watchedSnapshot.upcomingDays.length > 0 ? (
              <div>
                <div className="metric-label" style={{ marginBottom: 8 }}>
                  Next 14 Days Forecast
                </div>
                <div className="week-strip" style={{ gap: 5 }}>
                  {watchedSnapshot.upcomingDays.map((item) => {
                    const cls = [
                      'week-day-btn',
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
                      <div
                        key={item.date}
                        className={cls}
                        style={{ minHeight: 48, cursor: 'default' }}
                        title={`${formatShortDate(item.date)}: ${PHASE_INFO[item.phase].shortLabel}`}
                      >
                        <span className="week-day-letter">{formatWeekdayShort(item.date)}</span>
                        <span className="week-day-num tabular" style={{ fontSize: '0.82rem' }}>
                          {getDayOfMonth(item.date)}
                        </span>
                      </div>
                    );
                  })}
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

                  {buildScheduledPartnerCareAlerts(watchedSnapshot).length > 0 ? (
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                      <strong>Upcoming care reminders:</strong>{' '}
                      {buildScheduledPartnerCareAlerts(watchedSnapshot)
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

      {/* SECTION 2: SHARE MY CYCLE PRIVATELY */}
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
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ minHeight: 42, padding: '8px 12px', fontSize: '0.82rem' }}
                onClick={() => void handleCopyCode()}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copied' : 'Copy'}
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
    </>
  );
}
