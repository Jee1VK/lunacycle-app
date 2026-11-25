import type { CustomThemeColors, ThemePreference } from '../types';

export const DEFAULT_CUSTOM_THEME: CustomThemeColors = {
  baseMode: 'light',
  primary: '#6B1D2F',
  accent: '#C5A059',
  canvas: '#FAFAF7',
};

export const CUSTOM_THEME_PRESETS: Array<{ name: string; colors: CustomThemeColors }> = [
  {
    name: 'Emerald Temple',
    colors: { baseMode: 'light', primary: '#1B4D3E', accent: '#C5A059', canvas: '#F7FAF8' },
  },
  {
    name: 'Midnight Plum',
    colors: { baseMode: 'dark', primary: '#C084FC', accent: '#E5C37A', canvas: '#140E1C' },
  },
  {
    name: 'Rose Quartz',
    colors: { baseMode: 'light', primary: '#9D174D', accent: '#D97706', canvas: '#FDF2F8' },
  },
  {
    name: 'Ocean Obsidian',
    colors: { baseMode: 'dark', primary: '#38BDF8', accent: '#FBBF24', canvas: '#0B1320' },
  },
];

const CUSTOM_VAR_KEYS = [
  '--color-brand-primary',
  '--color-brand-primary-hover',
  '--color-brand-primary-soft',
  '--color-brand-primary-mid',
  '--color-brand-accent',
  '--color-brand-accent-soft',
  '--color-brand-secondary',
  '--color-brand-secondary-soft',
  '--color-canvas-base',
  '--color-surface-card',
  '--color-surface-elevated',
  '--color-border-subtle',
  '--color-border-focus',
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-muted',
  '--color-text-inverse',
  '--color-ovulation-text',
  '--color-feedback-error',
  '--color-danger-bg',
  '--color-danger-bg-hover',
  '--color-danger-border',
  '--header-bg',
  '--nav-bg',
  '--hero-gradient',
] as const;

export function isValidHexColor(hex: string | undefined): hex is string {
  return typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex.trim());
}

export function sanitizeCustomTheme(input?: Partial<CustomThemeColors> | null): CustomThemeColors {
  const baseMode = input?.baseMode === 'dark' ? 'dark' : 'light';
  const fallbackCanvas = baseMode === 'dark' ? '#141211' : '#FAFAF7';
  const fallbackPrimary = baseMode === 'dark' ? '#D97C8F' : '#6B1D2F';
  const fallbackAccent = baseMode === 'dark' ? '#E0BE78' : '#C5A059';
  return {
    baseMode,
    primary: isValidHexColor(input?.primary) ? input.primary.toUpperCase() : fallbackPrimary,
    accent: isValidHexColor(input?.accent) ? input.accent.toUpperCase() : fallbackAccent,
    canvas: isValidHexColor(input?.canvas) ? input.canvas.toUpperCase() : fallbackCanvas,
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function mixHex(hexA: string, hexB: string, weightA: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const w = Math.max(0, Math.min(1, weightA));
  return rgbToHex(r1 * w + r2 * (1 - w), g1 * w + g2 * (1 - w), b1 * w + b2 * (1 - w));
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getContrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
}

export function isDarkHex(hex: string): boolean {
  const safe = isValidHexColor(hex) ? hex : '#FAFAF7';
  return getContrastRatio(safe, '#F5F2EC') > getContrastRatio(safe, '#1C1917');
}

export function buildCustomThemeCssVars(raw: Partial<CustomThemeColors> | undefined): Record<string, string> {
  const c = sanitizeCustomTheme(raw);
  // Always derive true dark/light polarity from actual canvas luminance so text is never unreadable
  const isDark = isDarkHex(c.canvas);

  const [cr, cg, cb] = hexToRgb(c.canvas);
  const cardBg = isDark ? mixHex(c.canvas, '#FFFFFF', 0.92) : mixHex(c.canvas, '#FFFFFF', 0.25);
  const [cardR, cardG, cardB] = hexToRgb(cardBg);
  const elevatedBg = isDark ? mixHex(c.canvas, '#FFFFFF', 0.85) : mixHex(c.canvas, '#000000', 0.94);
  const borderSubtle = isDark ? mixHex(c.canvas, '#FFFFFF', 0.78) : mixHex(c.canvas, '#000000', 0.88);

  const primaryHover = isDark ? mixHex(c.primary, '#FFFFFF', 0.85) : mixHex(c.primary, '#000000', 0.85);
  const primarySoft = mixHex(c.primary, c.canvas, isDark ? 0.24 : 0.13);
  const primaryMid = mixHex(c.primary, c.canvas, 0.78);
  const accentSoft = mixHex(c.accent, c.canvas, isDark ? 0.22 : 0.16);

  const textOnPrimary = getContrastRatio(c.primary, '#FFFFFF') >= getContrastRatio(c.primary, '#141211')
    ? '#FFFFFF'
    : '#141211';

  const textPrimary = isDark ? '#F5F2EC' : '#1C1917';
  const textSecondary = isDark ? '#CFC9C0' : '#4B5563';
  const textMuted = isDark ? '#A1998E' : '#6B7280';

  return {
    '--color-brand-primary': c.primary,
    '--color-brand-primary-hover': primaryHover,
    '--color-brand-primary-soft': primarySoft,
    '--color-brand-primary-mid': primaryMid,
    '--color-brand-accent': c.accent,
    '--color-brand-accent-soft': accentSoft,
    '--color-brand-secondary': isDark ? '#6BB39B' : '#1B4D3E',
    '--color-brand-secondary-soft': isDark ? '#172722' : '#E9F2EE',
    '--color-canvas-base': c.canvas,
    '--color-surface-card': cardBg,
    '--color-surface-elevated': elevatedBg,
    '--color-border-subtle': borderSubtle,
    '--color-border-focus': c.accent,
    '--color-text-primary': textPrimary,
    '--color-text-secondary': textSecondary,
    '--color-text-muted': textMuted,
    '--color-text-inverse': textOnPrimary,
    '--color-ovulation-text': isDark ? mixHex(c.accent, '#FFFFFF', 0.75) : mixHex(c.accent, '#000000', 0.55),
    '--color-feedback-error': isDark ? '#FCA5A5' : '#B91C1C',
    '--color-danger-bg': isDark ? '#36181A' : '#FEF2F2',
    '--color-danger-bg-hover': isDark ? '#471F22' : '#FEE2E2',
    '--color-danger-border': isDark ? '#6B2C30' : '#FECACA',
    '--header-bg': `rgba(${cr}, ${cg}, ${cb}, 0.92)`,
    '--nav-bg': `rgba(${cardR}, ${cardG}, ${cardB}, 0.96)`,
    '--hero-gradient': `linear-gradient(180deg, ${cardBg} 0%, ${c.canvas} 100%)`,
  };
}

export function applyThemeToDocument(
  theme: ThemePreference,
  customTheme?: CustomThemeColors,
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = theme;

  if (theme === 'custom') {
    const safe = sanitizeCustomTheme(customTheme);
    const darkCanvas = isDarkHex(safe.canvas);
    const vars = buildCustomThemeCssVars(safe);
    root.style.colorScheme = darkCanvas ? 'dark' : 'light';
    for (const [k, v] of Object.entries(vars)) {
      root.style.setProperty(k, v);
    }
    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.content = darkCanvas ? safe.canvas : safe.primary;
    }
    return;
  }

  // Clear any inline custom-theme properties when using built-in themes
  root.style.removeProperty('color-scheme');
  for (const key of CUSTOM_VAR_KEYS) {
    root.style.removeProperty(key);
  }

  const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeMeta) {
    const colorMap: Record<Exclude<ThemePreference, 'custom'>, string> = {
      system: '#6B1D2F',
      light: '#6B1D2F',
      dark: '#141211',
      burgundy: '#1A0B10',
      maroon: '#6B1D2F',
    };
    themeMeta.content = colorMap[theme] ?? '#6B1D2F';
  }
}
