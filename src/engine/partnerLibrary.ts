import type { CyclePhase, PartnerSnapshot } from '../types';

export type ArticleIllustrationId =
  | 'period'
  | 'cramps'
  | 'energy'
  | 'ovulation'
  | 'libido'
  | 'luteal'
  | 'stress'
  | 'support'
  | 'bbt'
  | 'nutrition'
  | 'pregnancy'
  | 'doctor';

export interface CycleArticle {
  id: string;
  title: string;
  subtitle: string;
  readMinutes: number;
  category: 'Cycle Science' | 'Partner Guide' | 'Wellness' | 'Fertility & TTC' | 'Pregnancy';
  phases: Array<CyclePhase | 'all'>;
  illustration: ArticleIllustrationId;
  accentBg: string;
  keyTakeaways: string[];
  sections: Array<{ heading: string; body: string }>;
  partnerTip: string;
}

export interface DateIdea {
  title: string;
  vibe: 'Cozy' | 'Playful' | 'Outdoors' | 'Romantic' | 'Relaxing';
  phases: Array<CyclePhase | 'all'>;
  description: string;
}

export interface MythFactItem {
  myth: string;
  fact: string;
  phaseHint: string;
}

export const PARTNER_DAILY_CHECKIN_ACTIONS: Array<{
  id: string;
  label: string;
  phases: Array<CyclePhase | 'all'>;
}> = [
  { id: 'ask-energy', label: 'Ask how her energy feels today — without rushing to fix', phases: ['all'] },
  { id: 'warm-drink', label: 'Bring a warm tea, water, or her favorite comfort snack', phases: ['menstrual', 'predicted_period', 'luteal'] },
  { id: 'take-chore', label: 'Take one recurring evening chore completely off her plate', phases: ['menstrual', 'luteal', 'pregnancy'] },
  { id: 'plan-outing', label: 'Suggest a fun walk, coffee date, or dinner out together', phases: ['follicular', 'fertile', 'ovulation'] },
  { id: 'quiet-night', label: 'Protect a calm, screen-light wind-down before bed', phases: ['menstrual', 'luteal', 'pregnancy'] },
  { id: 'appreciation', label: 'Share one specific thing you appreciated about her today', phases: ['all'] },
];

export const DATE_WHEEL_IDEAS: DateIdea[] = [
  {
    title: 'Blanket Fort & Favorite Comfort Movie',
    vibe: 'Cozy',
    phases: ['menstrual', 'predicted_period', 'luteal', 'pregnancy'],
    description: 'Warm snacks, zero dress code, phones on silent, and her pick of movie.',
  },
  {
    title: 'Cook Her Favorite Warm Meal Together',
    vibe: 'Cozy',
    phases: ['menstrual', 'luteal', 'all'],
    description: 'You handle prep and cleanup while she relaxes with music and tea.',
  },
  {
    title: 'Sunset Walk & Street-Side Chai / Coffee',
    vibe: 'Outdoors',
    phases: ['follicular', 'fertile', 'ovulation', 'all'],
    description: 'Golden-hour stroll with unhurried conversation and a warm cup.',
  },
  {
    title: 'Try a New Cafe or Dessert Spot',
    vibe: 'Playful',
    phases: ['follicular', 'fertile', 'ovulation'],
    description: 'Take advantage of rising mid-cycle energy with somewhere neither of you has tried.',
  },
  {
    title: 'At-Home Spa & Shoulder Massage Night',
    vibe: 'Relaxing',
    phases: ['menstrual', 'luteal', 'pregnancy'],
    description: 'Warm towel, gentle neck/back massage, calming playlist, zero rush.',
  },
  {
    title: 'Candlelit Dinner Date (Home or Out)',
    vibe: 'Romantic',
    phases: ['fertile', 'ovulation', 'follicular', 'all'],
    description: 'Dress up a little, put phones away, and make the evening feel intentional.',
  },
  {
    title: 'Board Game or Trivia Night for Two',
    vibe: 'Playful',
    phases: ['follicular', 'luteal', 'all'],
    description: 'Lighthearted competition with homemade snacks and laughs.',
  },
  {
    title: 'Slow Sunday Morning Breakfast in Bed',
    vibe: 'Relaxing',
    phases: ['menstrual', 'pregnancy', 'luteal', 'all'],
    description: 'Fresh fruit, warm toast or dosas, coffee or herbal tea — let her sleep in.',
  },
];

export const CYCLE_MYTHS: MythFactItem[] = [
  {
    myth: 'Ovulation always happens on Day 14.',
    fact: 'Only in a textbook 28-day cycle with a 14-day luteal phase. Ovulation commonly ranges from Day 11 to Day 21 depending on her unique cycle length.',
    phaseHint: 'Fertility & Ovulation',
  },
  {
    myth: 'PMS is only about mood swings.',
    fact: 'Late-luteal progesterone drops can trigger physical symptoms too — bloating, fatigue, disrupted sleep, cravings, and breast tenderness.',
    phaseHint: 'Luteal Phase',
  },
  {
    myth: 'A late period always means pregnancy.',
    fact: 'Travel, poor sleep, illness, intense exercise, or work stress can delay ovulation — which pushes the entire period back by several days.',
    phaseHint: 'Cycle Rhythm',
  },
  {
    myth: 'Period blood is a huge volume of blood.',
    fact: 'Most periods total roughly 30–60 mL (2–4 tablespoons) over the whole span, mixed with uterine lining tissue. Tracking mL helps spot unusually heavy flow.',
    phaseHint: 'Menstrual Phase',
  },
];

export const CYCLE_ARTICLES: CycleArticle[] = [
  {
    id: 'what-is-a-period',
    title: 'What actually is a period?',
    subtitle: 'How the uterine lining builds and resets every cycle',
    readMinutes: 4,
    category: 'Cycle Science',
    phases: ['menstrual', 'predicted_period', 'all'],
    illustration: 'period',
    accentBg: 'var(--color-brand-primary-soft)',
    keyTakeaways: [
      'A period is the shedding of the nutrient-rich uterine lining (endometrium) when pregnancy does not occur.',
      'Typical bleeding lasts 3–7 days, with heaviest flow usually on Days 1–2.',
      'Estrogen and progesterone start near their lowest baseline, which is why energy can feel quieter.',
    ],
    sections: [
      {
        heading: 'Day 1 starts a brand-new cycle',
        body: 'The first day of full menstrual flow (not isolated spotting) is counted as Cycle Day 1. Over the next several days, the uterus gently contracts to release the lining it built during the previous month.',
      },
      {
        heading: 'Why energy often dips early on',
        body: 'Because both estrogen and progesterone sit at their lowest levels at the start of bleeding, it is completely normal to crave extra sleep, warmth, and slower pacing.',
      },
    ],
    partnerTip: 'Check if she has her preferred comfort essentials stocked, keep plans flexible on Days 1–2, and offer warm meals or tea without being asked.',
  },
  {
    id: 'cramps-and-relief',
    title: 'Why cramps happen & what actually helps',
    subtitle: 'Understanding prostaglandins, heat therapy, and gentle care',
    readMinutes: 3,
    category: 'Wellness',
    phases: ['menstrual', 'predicted_period'],
    illustration: 'cramps',
    accentBg: 'var(--color-brand-primary-soft)',
    keyTakeaways: [
      'Hormone-like compounds called prostaglandins trigger uterine muscle contractions — higher levels mean stronger cramps.',
      'Consistent local heat (heating pad or warm bath) relaxes muscle fibers and improves blood flow.',
      'Severe pain that disrupts daily life is worth discussing with an OB-GYN — it should not be dismissed as "just normal."',
    ],
    sections: [
      {
        heading: 'The biology behind period pain',
        body: 'Prostaglandins help the uterus shed its lining, but spikes can temporarily tighten nearby blood vessels and radiate into the lower back or thighs.',
      },
      {
        heading: 'Practical relief that works',
        body: 'Warm compresses, hydration, light stretching, magnesium-rich foods, and rest can make a noticeable difference alongside clinician-recommended pain relief when needed.',
      },
    ],
    partnerTip: 'Bring a warm heating pad or hot water bottle before she has to ask, and take over standing chores like cooking or dishes.',
  },
  {
    id: 'follicular-energy-rise',
    title: 'The Follicular rise: why energy rebounds',
    subtitle: 'How rising estrogen lifts focus, mood, and social drive',
    readMinutes: 3,
    category: 'Cycle Science',
    phases: ['follicular'],
    illustration: 'energy',
    accentBg: 'var(--color-brand-secondary-soft)',
    keyTakeaways: [
      'As bleeding finishes, estrogen climbs steadily while follicles mature in the ovaries.',
      'Many people notice clearer focus, lighter mood, and better workout recovery during this phase.',
      'It is often the best window for shared adventures, new restaurants, or tackling bigger projects.',
    ],
    sections: [
      {
        heading: 'Building momentum after bleeding',
        body: 'Rising estrogen supports serotonin and dopamine signaling, which often translates to optimism, curiosity, and physical stamina.',
      },
      {
        heading: 'Making the most of this window',
        body: 'If you have been meaning to plan a weekend outing, a playful date night, or an active morning walk together, the follicular phase is usually a great fit.',
      },
    ],
    partnerTip: 'Use the Date Idea Wheel for a playful or outdoor plan — she may enjoy trying somewhere new together.',
  },
  {
    id: 'ovulation-fertile-window',
    title: 'Ovulation & the 6-day fertile window',
    subtitle: 'Why conception is possible before ovulation day itself',
    readMinutes: 4,
    category: 'Fertility & TTC',
    phases: ['fertile', 'ovulation'],
    illustration: 'ovulation',
    accentBg: 'var(--color-brand-accent-soft)',
    keyTakeaways: [
      'An egg survives ~12–24 hours after release, while sperm can survive up to 5 days in fertile cervical mucus.',
      'That creates a ~6-day fertile window ending roughly 1 day after ovulation.',
      'Egg-white cervical mucus and a Peak LH strip test are two of the strongest real-time fertility cues.',
    ],
    sections: [
      {
        heading: 'More than a single day',
        body: 'Ovulation is the moment a mature egg is released, typically around 12–16 days before the next period starts. Because sperm can wait inside the reproductive tract, the 5 days leading up to ovulation are also fertile.',
      },
      {
        heading: 'Calendar estimates vs real-time cues',
        body: 'Calendar math gives a helpful estimate, while logging LH strip peaks and morning BBT helps pinpoint ovulation far more accurately — especially for Trying to Conceive (TTC).',
      },
    ],
    partnerTip: 'If you are Trying to Conceive, keep the atmosphere relaxed and affectionate rather than overly clinical or high-pressure.',
  },
  {
    id: 'libido-and-cycle',
    title: 'What is sex drive & how cycles shape it?',
    subtitle: 'Why desire naturally ebbs and flows across the month',
    readMinutes: 4,
    category: 'Partner Guide',
    phases: ['fertile', 'ovulation', 'luteal', 'all'],
    illustration: 'libido',
    accentBg: 'var(--color-brand-primary-soft)',
    keyTakeaways: [
      'Desire is shaped by hormones (estrogen & a brief testosterone surge near ovulation) AND emotional safety, sleep, and stress.',
      'Many people notice higher libido near ovulation and quieter desire during heavy bleeding or late-luteal fatigue.',
      'Fluctuations are normal biology — not a reflection of attraction or relationship health.',
    ],
    sections: [
      {
        heading: 'Hormonal tides across the month',
        body: 'Around mid-cycle, peaking estrogen and a small rise in testosterone often heighten sensitivity and desire. Later in the luteal phase, progesterone promotes calm and restfulness.',
      },
      {
        heading: 'Stress is the biggest brake pedal',
        body: 'Even during high-estrogen days, exhaustion, mental load, or unresolved tension can dampen desire. Feeling supported and unhurried matters just as much as hormones.',
      },
    ],
    partnerTip: 'Stay affectionate without expectations during quieter phases — closeness without pressure builds deeper trust all month.',
  },
  {
    id: 'luteal-phase-pms',
    title: 'Inside the Luteal phase & PMS',
    subtitle: 'Progesterone, deeper rest needs, and navigating late-cycle dips',
    readMinutes: 4,
    category: 'Cycle Science',
    phases: ['luteal', 'predicted_period'],
    illustration: 'luteal',
    accentBg: 'var(--color-brand-accent-soft)',
    keyTakeaways: [
      'After ovulation, progesterone rises and slightly raises resting body temperature (~0.2–0.4 °C).',
      'In the final 3–5 days before a period, falling hormones can trigger bloating, cravings, sensitivity, or restless sleep.',
      'Complex carbs, steady meals, and extra patience go a long way.',
    ],
    sections: [
      {
        heading: 'Why cravings & fatigue show up',
        body: 'Metabolic rate ticks up slightly during the luteal phase, which is why hunger and cravings for warm or comforting foods are real physiological signals.',
      },
      {
        heading: 'What helps most in the PMS window',
        body: 'Avoid stacking stressful conversations or packed social calendars in the final few days before her period when possible.',
      },
    ],
    partnerTip: 'Never brush off feelings with "are you PMSing?" — validate her feelings first, offer comfort, and lighten her evening load.',
  },
  {
    id: 'why-periods-shift',
    title: 'Why periods arrive early or late',
    subtitle: 'How stress, travel, sleep, and illness shift ovulation',
    readMinutes: 3,
    category: 'Cycle Science',
    phases: ['all', 'luteal'],
    illustration: 'stress',
    accentBg: 'var(--color-surface-elevated)',
    keyTakeaways: [
      'A cycle variation of up to 7 days from month to month is still considered clinically regular.',
      'Stress hormones (cortisol) can temporarily delay ovulation, making a period look "late."',
      'Logging life events in Notes helps spot whether travel or poor sleep caused a shift.',
    ],
    sections: [
      {
        heading: 'The follicular phase is the flexible half',
        body: 'The time between ovulation and a period (the luteal phase) stays fairly steady for each person (~12–16 days). Most cycle-length surprises happen because ovulation occurred earlier or later than usual.',
      },
    ],
    partnerTip: 'If her period is a few days late and she feels anxious, stay calm and supportive rather than panicking or guessing.',
  },
  {
    id: 'supportive-partner-playbook',
    title: 'How to be a genuinely supportive partner',
    subtitle: 'Small daily habits that make a huge difference every month',
    readMinutes: 3,
    category: 'Partner Guide',
    phases: ['all', 'menstrual', 'luteal'],
    illustration: 'support',
    accentBg: 'var(--color-brand-secondary-soft)',
    keyTakeaways: [
      'Notice patterns quietly — checking the Partner tab shows you her phase without making her repeat herself.',
      'Lead with curiosity ("What would feel good tonight?") instead of assumptions.',
      'Small proactive gestures beat grand fixes every time.',
    ],
    sections: [
      {
        heading: 'Match the energy of her phase',
        body: 'Support looks different across the month: cozy rest and practical help during Menstrual/Luteal days, shared adventure and celebration during Follicular/Ovulation days.',
      },
    ],
    partnerTip: 'Use the Daily Check-In card in the Partner tab to pick one 2-minute gesture each day.',
  },
  {
    id: 'bbt-sympto-thermal',
    title: 'Basal Body Temperature & the 3-over-6 shift',
    subtitle: 'How morning temperature confirms ovulation occurred',
    readMinutes: 4,
    category: 'Fertility & TTC',
    phases: ['fertile', 'ovulation', 'follicular'],
    illustration: 'bbt',
    accentBg: 'var(--color-brand-secondary-soft)',
    keyTakeaways: [
      'BBT is taken first thing upon waking before getting out of bed.',
      'Progesterone released after ovulation raises resting temperature by ~0.2–0.4 °C.',
      'Three consecutive temps above the previous six confirm ovulation — LunaCycle plots this coverline automatically in Insights.',
    ],
    sections: [
      {
        heading: 'Reading the coverline',
        body: 'Once 3 consecutive readings rise above the prior 6 baseline temps, LunaCycle draws a dashed Antique Gold coverline on the BBT chart so you can clearly see the biphasic thermal shift.',
      },
    ],
    partnerTip: 'If she tracks morning BBT, keeping the thermometer charged and within reach on her nightstand is a thoughtful touch.',
  },
  {
    id: 'nutrition-across-phases',
    title: 'Iron, magnesium & gentle cycle nutrition',
    subtitle: 'Simple everyday foods that support each phase naturally',
    readMinutes: 4,
    category: 'Wellness',
    phases: ['menstrual', 'luteal', 'all'],
    illustration: 'nutrition',
    accentBg: 'var(--color-brand-accent-soft)',
    keyTakeaways: [
      'Menstrual phase: iron-rich meals (spinach, lentils, dates, jaggery) paired with vitamin C help replenish stores.',
      'Luteal phase: magnesium (dark chocolate, pumpkin seeds, bananas, oats) supports calmer sleep and eases cramps.',
      'Hydration reduces bloating and headaches across every phase.',
    ],
    sections: [
      {
        heading: 'Warmth and nourishment over strict rules',
        body: 'Cycle-aware eating is about adding helpful nutrients — not rigid restriction. Warm soups, dal, leafy greens, and steady protein help keep blood sugar and mood even.',
      },
    ],
    partnerTip: 'Surprising her with warm dal-rice, dark chocolate, or fresh fruit during her period or PMS window is always a win.',
  },
  {
    id: 'pregnancy-partner-guide',
    title: 'Supporting her through Trimesters 1, 2 & 3',
    subtitle: 'What shifts in each trimester and how you can show up',
    readMinutes: 5,
    category: 'Pregnancy',
    phases: ['pregnancy'],
    illustration: 'pregnancy',
    accentBg: 'var(--color-brand-accent-soft)',
    keyTakeaways: [
      'Trimester 1 (Weeks 1–12): fatigue and nausea can be intense even before a bump shows — protect her rest.',
      'Trimester 2 (Weeks 13–27): energy often steadies; great window for prenatal visits and nursery prep together.',
      'Trimester 3 (Weeks 28–40): comfort, lifting help, and hospital bag readiness take priority.',
    ],
    sections: [
      {
        heading: 'Being her advocate and anchor',
        body: 'Attend appointments when possible, keep track of questions for the OB-GYN in Notes, and handle physical errands as the third trimester progresses.',
      },
    ],
    partnerTip: 'Use the Doctor PDF Summary in Settings to bring clean symptom and wellness notes to prenatal checkups.',
  },
  {
    id: 'when-to-see-obgyn',
    title: 'When to check in with an OB-GYN',
    subtitle: 'Helpful signals your cycle history can flag for a clinician',
    readMinutes: 3,
    category: 'Wellness',
    phases: ['all'],
    illustration: 'doctor',
    accentBg: 'var(--color-surface-elevated)',
    keyTakeaways: [
      'Cycles consistently shorter than 21 days or longer than 35 days (outside teens/perimenopause).',
      'Soaking through pads/tampons every 1–2 hours or passing large clots repeatedly.',
      'Severe pain that does not respond to standard relief or interferes with work/school.',
    ],
    sections: [
      {
        heading: 'Bring objective data to the appointment',
        body: 'Clinicians love clear timelines. Export LunaCycle’s one-tap Doctor PDF Report from Insights or Settings to share exact cycle lengths, variation, symptoms, and BBT trends in seconds.',
      },
    ],
    partnerTip: 'Offer to accompany her or help prepare the printed Doctor PDF summary before her clinic visit.',
  },
];

export function getArticlesForPhase(phase: CyclePhase): CycleArticle[] {
  const exact = CYCLE_ARTICLES.filter((a) => a.phases.includes(phase));
  const rest = CYCLE_ARTICLES.filter((a) => !a.phases.includes(phase));
  return [...exact, ...rest];
}

export function getDateIdeasForPhase(phase: CyclePhase): DateIdea[] {
  const matching = DATE_WHEEL_IDEAS.filter(
    (d) => d.phases.includes(phase) || d.phases.includes('all'),
  );
  return matching.length > 0 ? matching : DATE_WHEEL_IDEAS;
}

export function getCheckinActionsForPhase(phase: CyclePhase) {
  return PARTNER_DAILY_CHECKIN_ACTIONS.filter(
    (a) => a.phases.includes(phase) || a.phases.includes('all'),
  ).slice(0, 4);
}

export function getPartnerDecoderSummary(snapshot: PartnerSnapshot | null, fallbackPhase: CyclePhase) {
  const phase = snapshot?.phase ?? fallbackPhase;
  const label = snapshot?.profileLabel ?? 'Your partner';
  return { phase, label };
}
