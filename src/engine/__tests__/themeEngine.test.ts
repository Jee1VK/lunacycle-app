import { describe, expect, it } from 'vitest';
import {
  buildCustomThemeCssVars,
  getContrastRatio,
  isValidHexColor,
  sanitizeCustomTheme,
} from '../themeEngine';
import { buildPartnerSnapshot, createDefaultPartnerShareConfig } from '../partnerSync';
import { computeCycleStats, computeTodaySummary } from '../cycleEngine';
import { ensureTemporal } from '../temporal';
import { createInitialData } from '../../types';

describe('themeEngine & Partner theme sync', () => {
  it('validates hex colors, sanitizes invalid inputs, and picks high-contrast button text', () => {
    expect(isValidHexColor('#6B1D2F')).toBe(true);
    expect(isValidHexColor('not-a-color')).toBe(false);

    const safe = sanitizeCustomTheme({ baseMode: 'dark', primary: 'bad', accent: '#E5C37A', canvas: '#140E1C' });
    expect(safe.baseMode).toBe('dark');
    expect(safe.primary).toBe('#D97C8F');
    expect(safe.accent).toBe('#E5C37A');
    expect(safe.canvas).toBe('#140E1C');

    // Light primary -> dark button text; dark primary -> white button text
    const lightBtnVars = buildCustomThemeCssVars({ baseMode: 'dark', primary: '#FDE68A', accent: '#E5C37A', canvas: '#141211' });
    expect(lightBtnVars['--color-text-inverse']).toBe('#141211');
    expect(getContrastRatio('#FDE68A', '#141211')).toBeGreaterThan(10);

    const darkBtnVars = buildCustomThemeCssVars({ baseMode: 'light', primary: '#1B4D3E', accent: '#C5A059', canvas: '#FAFAF7' });
    expect(darkBtnVars['--color-text-inverse']).toBe('#FFFFFF');
    expect(getContrastRatio('#1B4D3E', '#FFFFFF')).toBeGreaterThan(8);
  });

  it('includes primary user theme and customTheme in encrypted PartnerSnapshot', async () => {
    await ensureTemporal();
    const data = createInitialData();
    data.settings.theme = 'custom';
    data.settings.customTheme = {
      baseMode: 'dark',
      primary: '#C084FC',
      accent: '#E5C37A',
      canvas: '#140E1C',
    };
    const stats = computeCycleStats(data.logs, data.settings);
    const summary = computeTodaySummary('2026-06-01', data.logs, stats, data.settings);
    const cfg = createDefaultPartnerShareConfig();

    const snap = buildPartnerSnapshot(cfg, data, stats, summary);
    expect(snap.theme).toBe('custom');
    expect(snap.customTheme).toEqual(data.settings.customTheme);
  });
});
