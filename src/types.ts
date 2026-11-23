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

export interface DailyLog {
  date: string; // Location-agnostic YYYY-MM-DD (Temporal.PlainDate)
  flow: FlowLevel;
  symptoms: SymptomId[];
  moods: MoodId[];
  mucus: MucusType;
  lhTest: LhTestResult;
  bbtC?: number;
  sleepHours?: number;
  waterGlasses?: number;
  sexLogged?: boolean;
  notes: string;
}

export interface ReminderSettings {
  periodEnabled: boolean;
  periodBeforeDays: number;
  fertileEnabled: boolean;
  dailyLogEnabled: boolean;
  dailyLogTime: string; // HH:mm wall-clock time
}

export interface UserSettings {
  mode: TrackingMode;
  defaultCycleLength: number;
  defaultPeriodLength: number;
  lutealLength: number;
  tempUnit: 'C' | 'F';
  pregnancyLmpDate: string | null;
  pregnancyDueDate: string | null;
  disguiseMode: boolean;
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

export const DEFAULT_SETTINGS: UserSettings = {
  mode: 'cycle',
  defaultCycleLength: 28,
  defaultPeriodLength: 5,
  lutealLength: 14,
  tempUnit: 'C',
  pregnancyLmpDate: null,
  pregnancyDueDate: null,
  disguiseMode: false,
  reminders: {
    periodEnabled: true,
    periodBeforeDays: 2,
    fertileEnabled: true,
    dailyLogEnabled: false,
    dailyLogTime: '20:00',
  },
};

export function createEmptyLog(date: string): DailyLog {
  return {
    date,
    flow: 'none',
    symptoms: [],
    moods: [],
    mucus: 'none',
    lhTest: 'none',
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
      reminders: { ...DEFAULT_SETTINGS.reminders },
    },
  };
}
