import type {
  CyclePhase,
  DailyLog,
  FlowLevel,
  LhTestResult,
  LunaData,
  MoodId,
  MucusType,
  SymptomId,
} from '../types';
import { createInitialData } from '../types';
import { addDays } from './temporal';

export const FLOW_OPTIONS: Array<{ id: FlowLevel; label: string; drops: number }> = [
  { id: 'none', label: 'None', drops: 0 },
  { id: 'spotting', label: 'Spotting', drops: 1 },
  { id: 'light', label: 'Light', drops: 1 },
  { id: 'medium', label: 'Medium', drops: 2 },
  { id: 'heavy', label: 'Heavy', drops: 3 },
];

export const SYMPTOM_OPTIONS: Array<{ id: SymptomId; label: string }> = [
  { id: 'cramps', label: 'Cramps' },
  { id: 'headache', label: 'Headache' },
  { id: 'bloating', label: 'Bloating' },
  { id: 'fatigue', label: 'Fatigue' },
  { id: 'tender_breasts', label: 'Tender breasts' },
  { id: 'backache', label: 'Lower backache' },
  { id: 'acne', label: 'Skin breakout' },
  { id: 'nausea', label: 'Nausea' },
  { id: 'cravings', label: 'Cravings' },
  { id: 'insomnia', label: 'Restless sleep' },
  { id: 'dizziness', label: 'Lightheaded' },
  { id: 'joint_ache', label: 'Body ache' },
];

export const MOOD_OPTIONS: Array<{ id: MoodId; label: string }> = [
  { id: 'calm', label: 'Calm' },
  { id: 'happy', label: 'Happy' },
  { id: 'energetic', label: 'Energetic' },
  { id: 'sensitive', label: 'Sensitive' },
  { id: 'anxious', label: 'Anxious' },
  { id: 'irritable', label: 'Irritable' },
  { id: 'low', label: 'Low mood' },
];

export const MUCUS_OPTIONS: Array<{ id: MucusType; label: string; fertilityHint: string }> = [
  { id: 'none', label: 'Not logged', fertilityHint: '' },
  { id: 'dry', label: 'Dry', fertilityHint: 'Low fertility' },
  { id: 'sticky', label: 'Sticky', fertilityHint: 'Low fertility' },
  { id: 'creamy', label: 'Creamy', fertilityHint: 'Transitional' },
  { id: 'watery', label: 'Watery', fertilityHint: 'High fertility' },
  { id: 'egg_white', label: 'Egg white', fertilityHint: 'Peak fertility' },
];

export const LH_OPTIONS: Array<{ id: LhTestResult; label: string }> = [
  { id: 'none', label: 'Not tested' },
  { id: 'negative', label: 'Negative' },
  { id: 'high', label: 'High' },
  { id: 'peak', label: 'Peak' },
];

export const SYMPTOM_LABEL_MAP: Record<SymptomId, string> = Object.fromEntries(
  SYMPTOM_OPTIONS.map((item) => [item.id, item.label]),
) as Record<SymptomId, string>;

export const MOOD_LABEL_MAP: Record<MoodId, string> = Object.fromEntries(
  MOOD_OPTIONS.map((item) => [item.id, item.label]),
) as Record<MoodId, string>;

export const FLOW_LABEL_MAP: Record<FlowLevel, string> = Object.fromEntries(
  FLOW_OPTIONS.map((item) => [item.id, item.label]),
) as Record<FlowLevel, string>;

export const PHASE_INFO: Record<
  CyclePhase,
  { title: string; shortLabel: string; summary: string; gentleCare: string }
> = {
  menstrual: {
    title: 'Menstrual Phase',
    shortLabel: 'Period',
    summary:
      'Estrogen and progesterone are at their lowest levels as the uterine lining sheds.',
    gentleCare:
      'Prioritize warm hydration, iron-rich foods, gentle stretching, and extra rest.',
  },
  predicted_period: {
    title: 'Predicted Period',
    shortLabel: 'Expected Period',
    summary:
      'Your next cycle is projected to start around this window based on your history.',
    gentleCare:
      'Log bleeding as soon as it starts to keep future predictions sharp.',
  },
  follicular: {
    title: 'Follicular Phase',
    shortLabel: 'Follicular',
    summary:
      'Estrogen gradually rises as follicles mature. Energy, clarity, and focus often rebound.',
    gentleCare:
      'Great window for steady movement, fresh meals, and tracking baseline BBT.',
  },
  fertile: {
    title: 'Fertile Window',
    shortLabel: 'Fertile Window',
    summary:
      'Estrogen peaks ahead of ovulation. Cervical mucus typically turns watery or stretchy.',
    gentleCare:
      'In TTC mode, logging daily LH tests and morning BBT helps pinpoint ovulation.',
  },
  ovulation: {
    title: 'Estimated Ovulation',
    shortLabel: 'Ovulation Peak',
    summary:
      'LH surges to release an egg. Conception probability is highest in this 24–48 hour window.',
    gentleCare:
      'Note any mild one-sided pelvic twinge, egg-white mucus, or slight temp shift.',
  },
  luteal: {
    title: 'Luteal Phase',
    shortLabel: 'Luteal',
    summary:
      'Progesterone rises and basal temperature stays slightly elevated. PMS cues may appear late in this phase.',
    gentleCare:
      'Steady complex carbs, magnesium-rich foods, and consistent sleep ease late-luteal dips.',
  },
  pregnancy: {
    title: 'Pregnancy Tracking',
    shortLabel: 'Pregnancy',
    summary:
      'Period predictions are paused while you track gestational weeks, symptoms, and notes.',
    gentleCare:
      'Log nausea, sleep, hydration, and questions for your next prenatal checkup.',
  },
};

/**
 * Generates realistic, clean 4-cycle demo data anchored relative to `today`
 * so users can immediately explore predictions, calendar, charts, BBT & PDF export.
 */
export function buildSampleDemoData(today: string): LunaData {
  const data = createInitialData();
  const logs: Record<string, DailyLog> = {};

  // Anchor 4 realistic cycles ending ~11 days before today (so today sits near fertile/follicular!)
  const cycleStarts = [
    addDays(today, -95),
    addDays(today, -67), // 28-day cycle
    addDays(today, -38), // 29-day cycle
    addDays(today, -11), // 27-day cycle (current cycle day 12!)
  ];

  const periodPatterns: FlowLevel[][] = [
    ['medium', 'heavy', 'medium', 'light', 'spotting'],
    ['light', 'heavy', 'medium', 'light', 'light'],
    ['medium', 'heavy', 'heavy', 'light', 'spotting'],
    ['medium', 'heavy', 'medium', 'light', 'light'],
  ];

  cycleStarts.forEach((start, cIdx) => {
    const pattern = periodPatterns[cIdx];
    pattern.forEach((flow, dIdx) => {
      const date = addDays(start, dIdx);
      logs[date] = {
        date,
        flow,
        symptoms:
          dIdx === 0
            ? ['cramps', 'fatigue']
            : dIdx === 1
              ? ['cramps', 'backache', 'bloating']
              : dIdx === 2
                ? ['fatigue']
                : [],
        moods: dIdx <= 1 ? ['sensitive'] : ['calm'],
        mucus: 'none',
        lhTest: 'none',
        bbtC: Number((36.28 + dIdx * 0.02).toFixed(2)),
        sleepHours: dIdx <= 1 ? 7 : 7.5,
        waterGlasses: 7,
        notes: dIdx === 0 ? 'Period started in the morning.' : '',
      };
    });

    // Add mid-cycle fertile & BBT readings for the most recent 2 cycles
    if (cIdx >= 2) {
      const cycleLen = cIdx === 2 ? 27 : 28;
      for (let dayOffset = 6; dayOffset < cycleLen; dayOffset++) {
        const date = addDays(start, dayOffset);
        if (date > today) break;
        const isOv = dayOffset === 13;
        const isPostOv = dayOffset > 13;
        const isPms = dayOffset >= cycleLen - 3;

        if (dayOffset % 2 === 0 || isOv || isPms) {
          logs[date] = {
            date,
            flow: 'none',
            symptoms: isPms
              ? ['bloating', 'tender_breasts', 'cravings']
              : isOv
                ? ['bloating']
                : [],
            moods: isPms ? ['sensitive', 'irritable'] : isOv ? ['energetic'] : ['calm', 'happy'],
            mucus: isOv
              ? 'egg_white'
              : dayOffset >= 10 && dayOffset <= 14
                ? 'watery'
                : isPostOv
                  ? 'creamy'
                  : 'sticky',
            lhTest: dayOffset === 12 ? 'peak' : dayOffset === 11 ? 'high' : 'none',
            bbtC: Number((isPostOv ? 36.68 + ((dayOffset % 3) * 0.04) : 36.32 + ((dayOffset % 2) * 0.03)).toFixed(2)),
            sleepHours: isPms ? 6.5 : 7.5,
            waterGlasses: 8,
            notes: isOv ? 'Clear energy peak today.' : '',
          };
        }
      }
    }
  });

  data.logs = logs;
  data.updatedAt = new Date().toISOString();
  return data;
}
