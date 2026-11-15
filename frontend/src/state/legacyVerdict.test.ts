import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setLang, translate } from '../i18n';
import { verdictText } from '../sky/catalogue';
import { legacyVerdictText } from './legacyVerdict';

describe('legacyVerdictText', () => {
  beforeAll(() => setLang('en', false));
  afterAll(() => setLang('en', false));

  const sentences = () => ({
    unmeasured: verdictText({ kind: 'unmeasured', source: null, catRate: null, moves: null }),
    none: verdictText({ kind: 'none', source: null, catRate: null, moves: null }),
    matchRate: verdictText({ kind: 'match', source: { name: "Barnard's Star", origin: 'known', gmag: null }, catRate: 10.3, moves: 'rate' }),
    matchStill: verdictText({ kind: 'match', source: { name: 'Gaia DR3 123', origin: 'gaia', gmag: 14.2 }, catRate: null, moves: 'still' }),
    mismatch: verdictText({ kind: 'mismatch', source: { name: 'Gaia DR3 5', origin: 'gaia', gmag: null }, catRate: 2.5, moves: 'rate' }),
  });

  it('words an old English sentence in Turkish again, with the same facts', () => {
    const old = sentences(); // what an older version stored
    setLang('tr', false);
    const now = sentences();
    for (const k of Object.keys(old) as (keyof typeof old)[]) {
      expect(legacyVerdictText(old[k]), k).toBe(now[k]);
    }
    expect(legacyVerdictText(old.matchRate)).toContain('yılda');
    setLang('en', false);
  });

  it('is the identity in English', () => {
    const old = sentences();
    for (const k of Object.keys(old) as (keyof typeof old)[]) expect(legacyVerdictText(old[k])).toBe(old[k]);
  });

  it('leaves a sentence it does not know as it was saved', () => {
    setLang('tr', false);
    expect(legacyVerdictText('Something an older version wrote.')).toBe('Something an older version wrote.');
    setLang('en', false);
    expect(translate('en', 'verdict.none').length).toBeGreaterThan(5);
  });
});

import { tickAnchor } from '../sky/charts';

describe('tickAnchor', () => {
  it('keeps a label inside the chart', () => {
    expect(tickAnchor(170, 'Mar 2026', 340)).toBe('middle');
    expect(tickAnchor(330, 'Eyl 2026', 340)).toBe('end');
    expect(tickAnchor(10, 'Ağu 2025', 340)).toBe('start');
  });
});
