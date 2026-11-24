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

export type PillRegimen = '21_7' | '28_active' | '24_4';

export interface PillPackSettings {
  enabled: boolean;
  regimen: PillRegimen;
  packStartDate: string | null; // YYYY-MM-DD
  reminderTime: string; // HH:mm
  takenDates: string[]; // YYYY-MM-DD[]
  larcType: string; // e.g. 'IUD', 'Implant', ''
  larcRenewalDate: string | null; // YYYY-MM-DD
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
}

export type ThemePreference = 'system' | 'light' | 'dark';
export type AppLanguage = 'en' | 'kn' | 'hi' | 'ta' | 'te';

export interface UserSettings {
  mode: TrackingMode;
  birthControlMode: boolean;
  simpleMode: boolean;
  theme: ThemePreference;
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
}

export interface PartnerSharePermissions {
  shareFertileWindow: boolean;
  shareSymptomsAndMood: boolean;
  shareUpcomingForecast: boolean;
}

export interface PartnerShareConfig {
  enabled: boolean;
  code: string;
  writeSecret: string;
  profileLabel: string;
  pinHash?: string;
  syncServerUrl: string;
  permissions: PartnerSharePermissions;
  lastSyncedAt?: string;
}

export interface PartnerWatchConfig {
  code: string;
  pinHash?: string;
  syncServerUrl: string;
  alertsOnThisPhone: boolean;
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
  todayMoods?: MoodId[];
  pregnancy?: PregnancySummary | null;
  upcomingDays?: Array<{ date: string; phase: CyclePhase }>;
  pinHash?: string;
  writeSecret?: string;
}

export const DEFAULT_SETTINGS: UserSettings = {
  mode: 'cycle',
  birthControlMode: false,
  simpleMode: false,
  theme: 'system',
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
    packStartDate: null,
    reminderTime: '21:00',
    takenDates: [],
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
