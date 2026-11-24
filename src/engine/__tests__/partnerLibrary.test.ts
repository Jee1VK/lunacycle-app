import { describe, expect, it } from 'vitest';
import {
  CYCLE_ARTICLES,
  CYCLE_MYTHS,
  getArticlesForPhase,
  getCheckinActionsForPhase,
  getDateIdeasForPhase,
} from '../partnerLibrary';

describe('partnerLibrary offline discover & articles', () => {
  it('contains 12 complete, well-structured offline articles', () => {
    expect(CYCLE_ARTICLES.length).toBeGreaterThanOrEqual(12);
    for (const a of CYCLE_ARTICLES) {
      expect(a.title.length).toBeGreaterThan(5);
      expect(a.keyTakeaways.length).toBeGreaterThanOrEqual(2);
      expect(a.sections.length).toBeGreaterThanOrEqual(1);
      expect(a.partnerTip.length).toBeGreaterThan(10);
    }
    expect(CYCLE_MYTHS.length).toBeGreaterThanOrEqual(4);
  });

  it('sorts articles by current cycle phase first and provides phase-matched date ideas & check-ins', () => {
    const menstrual = getArticlesForPhase('menstrual');
    expect(menstrual[0].phases).toContain('menstrual');

    const preg = getArticlesForPhase('pregnancy');
    expect(preg[0].id).toBe('pregnancy-partner-guide');

    const cozyDates = getDateIdeasForPhase('menstrual');
    expect(cozyDates.length).toBeGreaterThan(0);

    const checkins = getCheckinActionsForPhase('luteal');
    expect(checkins.length).toBeGreaterThanOrEqual(2);
  });
});
