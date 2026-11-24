import type { AppLanguage } from '../types';

export const LANGUAGE_OPTIONS: Array<{ id: AppLanguage; label: string; native: string }> = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { id: 'hi', label: 'Hindi', native: 'हिन्दी' },
];

export interface UiStrings {
  navToday: string;
  navCalendar: string;
  navPartner: string;
  navInsights: string;
  navSettings: string;
  logPeriodToday: string;
  removePeriodToday: string;
  logSymptomsNotes: string;
  thisWeek: string;
  tapAnyDay: string;
  onDevice: string;
}

const STRINGS: Record<AppLanguage, UiStrings> = {
  en: {
    navToday: 'Today',
    navCalendar: 'Calendar',
    navPartner: 'Partner',
    navInsights: 'Insights',
    navSettings: 'Settings',
    logPeriodToday: 'Log Period Today',
    removePeriodToday: 'Period Ended / Remove Today',
    logSymptomsNotes: 'Log Symptoms & Notes',
    thisWeek: 'This Week',
    tapAnyDay: 'Tap any day to log',
    onDevice: 'On-device',
  },
  kn: {
    navToday: 'ಇಂದು',
    navCalendar: 'ಕ್ಯಾಲೆಂಡರ್',
    navPartner: 'ಸಂಗಾತಿ',
    navInsights: 'ವಿಶ್ಲೇಷಣೆ',
    navSettings: 'ಸೆಟ್ಟಿಂಗ್ಸ್',
    logPeriodToday: 'ಇಂದಿನ ಮುಟ್ಟು ದಾಖಲಿಸಿ',
    removePeriodToday: 'ಇಂದಿನ ದಾಖಲೆ ತೆಗೆಯಿರಿ',
    logSymptomsNotes: 'ಲಕ್ಷಣಗಳು ಮತ್ತು ಟಿಪ್ಪಣಿ',
    thisWeek: 'ಈ ವಾರ',
    tapAnyDay: 'ದಾಖಲಿಸಲು ದಿನ ಒತ್ತಿರಿ',
    onDevice: 'ಸಾಧನದಲ್ಲಿಯೇ',
  },
  hi: {
    navToday: 'आज',
    navCalendar: 'कैलेंडर',
    navPartner: 'पार्टनर',
    navInsights: 'इनसाइट्स',
    navSettings: 'सेटिंग्स',
    logPeriodToday: 'आज का पीरियड लॉग करें',
    removePeriodToday: 'आज की एंट्री हटाएँ',
    logSymptomsNotes: 'लक्षण और नोट्स लॉग करें',
    thisWeek: 'इस सप्ताह',
    tapAnyDay: 'लॉग करने के लिए दिन चुनें',
    onDevice: 'ऑन-डिवाइस',
  },
};

export function getUiStrings(lang: AppLanguage): UiStrings {
  return STRINGS[lang] ?? STRINGS.en;
}
