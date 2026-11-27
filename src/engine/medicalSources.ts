/**
 * Peer-Reviewed Clinical & Physiological Citations (Apple Guideline 1.4.1 & Google Play Health Policy).
 * Every menstrual, ovulation, BBT, symptom, and gestational calculation in LunaCycle maps directly
 * to established, publicly verifiable obstetric & gynecological literature.
 */

export interface MedicalCitation {
  id: string;
  topic: string;
  organization: string;
  title: string;
  summary: string;
  url: string;
}

export const WELLNESS_MEDICAL_DISCLAIMER =
  'LunaCycle is a wellness & reminder log only—NOT a contraceptive method, birth-control device, or clinical diagnostic tool.';

export const PHYSICIAN_CONSULTATION_NOTICE =
  'Always consult a qualified OB-GYN or physician before making any medical, fertility, pregnancy, or medication decisions.';

export const MEDICAL_CITATIONS: MedicalCitation[] = [
  {
    id: 'acog-651',
    topic: 'Menstrual Cycle Length & Regularity (21–35 Day Band)',
    organization: 'American College of Obstetricians and Gynecologists (ACOG)',
    title: 'Committee Opinion No. 651: Menstruation in Girls and Adolescents — Using the Menstrual Cycle as a Vital Sign',
    summary:
      'Establishes standard menstrual cycle tracking parameters, typical adult cycle intervals (21–35 days), bleeding duration (2–7 days), and clinical thresholds warranting OB-GYN evaluation.',
    url: 'https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2015/12/menstruation-in-girls-and-adolescents-using-the-menstrual-cycle-as-a-vital-sign',
  },
  {
    id: 'figo-2018',
    topic: 'Cycle Variation & Heavy Bleeding Thresholds',
    organization: 'International Federation of Gynecology and Obstetrics (FIGO)',
    title: 'Munro MG et al. The two FIGO systems for normal and abnormal uterine bleeding symptoms (Int J Gynaecol Obstet, 2018)',
    summary:
      'Defines international clinical reference standards for cycle-to-cycle regularity variation (<= 7–9 days), normal bleeding duration (<= 8 days), and heavy menstrual flow (> 80 mL).',
    url: 'https://pubmed.ncbi.nlm.nih.gov/30198563/',
  },
  {
    id: 'nejm-wilcox',
    topic: '6-Day Fertile Window & Ovulation Timing',
    organization: 'New England Journal of Medicine (NIH / NIEHS)',
    title: 'Wilcox AJ, Weinberg CR, Baird DD. Timing of Sexual Intercourse in Relation to Ovulation (NEJM, 1995; 333:1517–1521)',
    summary:
      'Landmark prospective clinical study establishing that conception occurs primarily within the 6-day window ending on the day of ovulation.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/7477165/',
  },
  {
    id: 'nih-ovulation-bbt',
    topic: 'Basal Body Temperature (BBT) Shift & Urinary LH Surge',
    organization: 'National Institutes of Health (NIH / PubMed Central)',
    title: 'Su HW et al. Detection of ovulation, a review of currently available methods (Bioeng Transl Med, 2017)',
    summary:
      'Reviews luteal-phase progesterone thermogenesis (~0.2–0.5 °C biphasic BBT shift above baseline coverline) and urinary LH peak timing (~24–36 hours prior to follicular rupture).',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5689497/',
  },
  {
    id: 'who-handbook',
    topic: 'Fertility Awareness & Physiological Cycle Phases',
    organization: 'World Health Organization (WHO) & Johns Hopkins CCP',
    title: 'Family Planning: A Global Handbook for Providers (4th ed., 2022)',
    summary:
      'Details follicular, ovulatory, and luteal physiology, cervical mucus observations, and explicitly notes why calendar-based cycle estimates have variable accuracy across individuals.',
    url: 'https://www.who.int/publications/i/item/9780999203705',
  },
  {
    id: 'acog-pms-mayo',
    topic: 'Premenstrual Syndrome (PMS) & Menstrual Symptom Care',
    organization: 'Mayo Clinic & ACOG Women’s Health Guidelines',
    title: 'Menstrual Cycle: What’s Normal, What’s Not & Premenstrual Syndrome (PMS) Clinical Guidance',
    summary:
      'Covers late-luteal hormone fluctuations, prostaglandin-mediated uterine cramping (dysmenorrhea), rest, hydration, heat therapy, and red-flag symptoms requiring clinical care.',
    url: 'https://www.mayoclinic.org/healthy-lifestyle/womens-health/in-depth/menstrual-cycle/art-20047186',
  },
  {
    id: 'acog-700-pregnancy',
    topic: 'Gestational Age (280 Days / 40 Weeks from LMP) & Trimesters',
    organization: 'ACOG & NIH NICHD',
    title: 'ACOG Committee Opinion No. 700: Methods for Estimating the Due Date & NICHD Pregnancy Trimester Overview',
    summary:
      'Defines standard 280-day (40w0d) gestational dating from Last Menstrual Period (LMP) and clinical trimester spans (Trimester 1: Weeks 1–12/13; Trimester 2: Weeks 13/14–27; Trimester 3: Weeks 28–40+).',
    url: 'https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2017/05/methods-for-estimating-the-due-date',
  },
];
