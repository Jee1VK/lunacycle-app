export type FlowLevel = 'none' | 'spotting' | 'light' | 'medium' | 'heavy';

export type SymptomId =
  | 'cramps'
  | 'headache'
  | 'bloating'
  | 'fatigue'
  | 'tender_breasts'
  | 'backache'
  | 'acne'
  | 'nausea'
  | 'cravings'
  | 'insomnia'
  | 'dizziness'
  | 'joint_ache';

export type MoodId =
  | 'calm'
  | 'happy'
  | 'energetic'
  | 'sensitive'
  | 'anxious'
  | 'irritable'
  | 'low';

export type MucusType = 'none' | 'dry' | 'sticky' | 'creamy' | 'watery' | 'egg_white';

export type LhTestResult = 'none' | 'negative' | 'high' | 'peak';

export type TrackingMode = 'cycle' | 'ttc' | 'pregnancy';

export type CyclePhase =
  | 'menstrual'
  | 'predicted_period'
  | 'follicular'
  | 'fertile'
  | 'ovulation'
  | 'luteal'
  | 'pregnancy';

export type RegularityStatus = 'learning' | 'regular' | 'slightly_variable' | 'irregular';

export type SanitaryProductType = 'pad' | 'tampon' | 'cup' | 'disc';

export interface ActiveHygieneTimer {
  product: SanitaryProductType;
  startedAt: string; // ISO timestamp
  durationHours: number;
  endsAt: string; // ISO timestamp
}

export interface HygieneChangeEntry {
  product: SanitaryProductType;
  changedAt: string; // ISO timestamp
  estimatedMl: number;
}

export type PillRegimen = '21_only' | '21_7' | '28_active' | '24_4' | 'custom';
export type PillStartMode = 'date' | 'period_day';
export type PillAlarmTone =
  | 'temple_chime'
  | 'classic_bell'
  | 'gentle_dawn'
  | 'marimba_breeze'
  | 'urgent_pulse';

export interface PillPackSettings {
  enabled: boolean;
  regimen: PillRegimen;
  startMode?: PillStartMode; // Fixed date or auto-aligned to logged period day (e.g. Day 2)
  startPeriodDay?: number; // 1..7 (e.g. 2 = 2nd day of logged period)
  packStartDate: string | null; // YYYY-MM-DD (used in 'date' mode or fallback)
  reminderTime: string; // Primary HH:mm (kept for backwards compatibility)
  reminderTimes?: string[]; // 1..4 daily reminder/alarm times (HH:mm)
  alarmEnabled?: boolean;
  alarmTone?: PillAlarmTone;
  totalPills?: number; // Total pills in pack/course (1..90)
  pillsPerDay?: number; // Number of pills to take each day (1..4)
  refillReminderEnabled?: boolean;
  refillThresholdDays?: number; // Remind when <= N days left in pack
  takenDates: string[]; // YYYY-MM-DD[]
  lateDates?: string[]; // YYYY-MM-DD[] subset of takenDates marked taken late
  larcType: string; // e.g. 'IUD', 'Implant', ''
  larcRenewalDate: string | null; // YYYY-MM-DD
}

export interface PartnerCarePing {
  id: string;
  direction?: 'to_primary' | 'to_partner';
  kind?: 'note' | 'hug' | 'request';
  message: string;
  senderLabel: string;
  sentAt: string; // ISO timestamp
  reaction?: string;
  seenAt?: string;
}

export interface PartnerCareThread {
  pings: PartnerCarePing[];
  updatedAt: string;
}

export interface DailyLog {
  date: string; // Location-agnostic YYYY-MM-DD (Temporal.PlainDate)
  flow: FlowLevel;
  symptoms: SymptomId[];
  customSymptoms?: string[];
  moods: MoodId[];
  customMoods?: string[];
  mucus: MucusType;
  lhTest: LhTestResult;
  bbtC?: number;
  sleepHours?: number;
  waterGlasses?: number;
  sexLogged?: boolean;
  hygieneChanges?: HygieneChangeEntry[];
  notes: string;
}

export interface ReminderSettings {
  periodEnabled: boolean;
  periodBeforeDays: number;
  pmsEnabled: boolean;
  fertileEnabled: boolean;
  dailyLogEnabled: boolean;
  dailyLogTime: string; // HH:mm wall-clock time
  customNotificationText: string;
  showLockScreenDetails?: boolean; // Default false -> discreet generic text on locked screens
}

export type ThemePreference = 'system' | 'light' | 'dark' | 'burgundy' | 'maroon' | 'custom';
export type AppLanguage = 'en' | 'kn' | 'hi' | 'ta' | 'te';

export interface CustomThemeColors {
  baseMode: 'light' | 'dark';
  primary: string; // #RRGGBB
  accent: string; // #RRGGBB
  canvas: string; // #RRGGBB
}

export interface UserSettings {
  mode: TrackingMode;
  birthControlMode: boolean;
  simpleMode: boolean;
  partnerOnlyMode?: boolean;
  theme: ThemePreference;
  customTheme?: CustomThemeColors;
  language: AppLanguage;
  defaultCycleLength: number;
  defaultPeriodLength: number;
  lutealLength: number;
  tempUnit: 'C' | 'F';
  pregnancyLmpDate: string | null;
  pregnancyDueDate: string | null;
  disguiseMode: boolean;
  customSymptoms: string[];
  customMoods: string[];
  pillPack: PillPackSettings;
  activeHygieneTimer: ActiveHygieneTimer | null;
  reminders: ReminderSettings;
}

export interface LunaData {
  version: 1;
  updatedAt: string;
  logs: Record<string, DailyLog>;
  settings: UserSettings;
}

export interface PeriodSpan {
  startDate: string;
  endDate: string;
  lengthDays: number;
  cycleLengthToNext: number | null;
}

export interface CycleStats {
  periods: PeriodSpan[];
  completedCycleLengths: number[];
  averageCycleLength: number;
  averagePeriodLength: number;
  minCycleLength: number | null;
  maxCycleLength: number | null;
  variationDays: number | null;
  regularity: RegularityStatus;
  hasLoggedPeriods: boolean;
}

export interface DayClassification {
  date: string;
  phase: CyclePhase;
  cycleDay: number | null;
  isLoggedPeriod: boolean;
  isPredictedPeriod: boolean;
  isFertile: boolean;
  isOvulation: boolean;
  isLatePeriod: boolean;
  daysLate: number;
  hasLogDetails: boolean;
}

export interface TodaySummary {
  today: string;
  mode: TrackingMode;
  phase: CyclePhase;
  cycleDay: number | null;
  daysUntilNextPeriod: number | null;
  daysLate: number;
  nextPeriodDate: string | null;
  ovulationDate: string | null;
  fertileStartDate: string | null;
  fertileEndDate: string | null;
  isPeriodActiveToday: boolean;
  pregnancy: PregnancySummary | null;
}

export interface PregnancySummary {
  lmpDate: string;
  dueDate: string;
  gestationalDays: number;
  weeks: number;
  days: number;
  trimester: 1 | 2 | 3;
  daysRemaining: number;
  progressPercent: number;
  milestone: string;
}

export interface PhaseSymptomInsight {
  phase: 'menstrual' | 'follicular' | 'fertile' | 'luteal';
  topSymptoms: Array<{ id: SymptomId; count: number }>;
  totalLoggedDays: number;
}

export interface PinLockConfig {
  enabled: boolean;
  saltBase64: string;
  verifierBase64: string;
  autoLockOnHide: boolean;
  biometricEnabled?: boolean;
  disguiseMode?: boolean;
  theme?: ThemePreference;
  customTheme?: CustomThemeColors;
}

export interface PartnerSharePermissions {
  shareFertileWindow: boolean;
  shareSymptomsAndMood: boolean;
  shareUpcomingForecast: boolean;
  sharePillRefillStatus?: boolean;
}

export interface PartnerShareConfig {
  enabled: boolean;
  code: string;
  syncKey?: string; // 128-bit random URL-safe base64 secret (never sent to relay; shared via #hash)
  writeSecret: string;
  profileLabel: string;
  pin?: string; // Kept locally in encrypted IndexedDB vault to derive E2EE AES-GCM key
  pinHash?: string;
  syncServerUrl: string;
  permissions: PartnerSharePermissions;
  todayNeedStatus?: string; // 1-tap "What I need today" beacon
  comfortPreferences?: string[]; // Personal "What helps me" comfort list
  adultSyncConsent?: boolean; // Stored inside encrypted IndexedDB vault
  dismissedCarePingId?: string; // Stored inside encrypted IndexedDB vault
  lastSyncedAt?: string;
}

export interface PartnerWatchConfig {
  code: string;
  syncKey?: string; // 128-bit random URL-safe base64 secret parsed from #partner=CODE.SYNCKEY
  pin?: string; // Kept locally in encrypted IndexedDB vault to decrypt E2EE snapshots
  pinHash?: string;
  syncServerUrl: string;
  partnerName?: string; // Sender name for Care Pings
  syncPartnerTheme?: boolean; // Automatically reflect primary user's chosen/custom theme (default true)
  alertsOnThisPhone: boolean;
  dailyCheckinTime?: string; // HH:mm evening partner check-in reminder
  careKitCycleKey?: string;
  careKitChecked?: string[];
  lastFetchedAt?: string;
}

export interface PartnerSnapshot {
  version: 1;
  code: string;
  profileLabel: string;
  updatedAt: string;
  asOfDate: string;
  mode: TrackingMode;
  phase: CyclePhase;
  cycleDay: number | null;
  averageCycleLength: number;
  daysUntilNextPeriod: number | null;
  daysLate: number;
  nextPeriodDate: string | null;
  isPeriodActiveToday: boolean;
  todayFlow?: FlowLevel;
  ovulationDate?: string | null;
  fertileStartDate?: string | null;
  fertileEndDate?: string | null;
  todaySymptoms?: SymptomId[];
  todayCustomSymptoms?: string[];
  todayMoods?: MoodId[];
  todayNeedStatus?: string;
  comfortPreferences?: string[];
  pillRefillNeeded?: boolean;
  pillDaysRemaining?: number;
  theme?: ThemePreference;
  customTheme?: CustomThemeColors;
  pregnancy?: PregnancySummary | null;
  upcomingDays?: Array<{ date: string; phase: CyclePhase }>;
  pinHash?: string;
  writeSecret?: string;
}

export const DEFAULT_SETTINGS: UserSettings = {
  mode: 'cycle',
  birthControlMode: false,
  simpleMode: false,
  partnerOnlyMode: false,
  theme: 'system',
  customTheme: {
    baseMode: 'light',
    primary: '#6B1D2F',
    accent: '#C5A059',
    canvas: '#FAFAF7',
  },
  language: 'en',
  defaultCycleLength: 28,
  defaultPeriodLength: 5,
  lutealLength: 14,
  tempUnit: 'C',
  pregnancyLmpDate: null,
  pregnancyDueDate: null,
  disguiseMode: false,
  customSymptoms: [],
  customMoods: [],
  pillPack: {
    enabled: false,
    regimen: '21_7',
    startMode: 'date',
    startPeriodDay: 2,
    packStartDate: null,
    reminderTime: '21:00',
    reminderTimes: ['21:00'],
    alarmEnabled: true,
    alarmTone: 'temple_chime',
    totalPills: 28,
    pillsPerDay: 1,
    refillReminderEnabled: true,
    refillThresholdDays: 5,
    takenDates: [],
    lateDates: [],
    larcType: '',
    larcRenewalDate: null,
  },
  activeHygieneTimer: null,
  reminders: {
    periodEnabled: true,
    periodBeforeDays: 2,
    pmsEnabled: true,
    fertileEnabled: true,
    dailyLogEnabled: false,
    dailyLogTime: '20:00',
    customNotificationText: '',
    showLockScreenDetails: false,
  },
};

export function createEmptyLog(date: string): DailyLog {
  return {
    date,
    flow: 'none',
    symptoms: [],
    customSymptoms: [],
    moods: [],
    customMoods: [],
    mucus: 'none',
    lhTest: 'none',
    hygieneChanges: [],
    notes: '',
  };
}

export function createInitialData(): LunaData {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    logs: {},
    settings: {
      ...DEFAULT_SETTINGS,
      customSymptoms: [],
      customMoods: [],
      pillPack: { ...DEFAULT_SETTINGS.pillPack, takenDates: [] },
      reminders: { ...DEFAULT_SETTINGS.reminders },
    },
  };
}
