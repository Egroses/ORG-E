import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { en } from './i18n/en';
import { tr } from './i18n/tr';
import { interpolate, pluralCategory, setLang, translate, translatePlural, t, type Key } from './i18n';
import { dateWindow, dayMonthYear, num, sig, visitLabels, monthYear } from './i18n/format';
import { resolveLang, LANG_KEY } from './i18n/lang';
import { makeEpochs } from './data/epochs';
import { answerKey, truthText } from './sky/analysis';
import { describeMeasurement, measureSource } from './sky/measure';
import { checkCatalogue, verdictText } from './sky/catalogue';
import { errorText, DataError } from './data/errors';
import { CASES, KNOWN } from './data/catalog';
import { GLOSSARY } from './data/glossary';
import { synthPatch } from './test/synth';

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dictionaries', () => {
  const enKeys = Object.keys(en).sort();
  const trKeys = Object.keys(tr).sort();

  it('have exactly the same keys', () => {
    expect(trKeys).toEqual(enKeys);
  });
  it('have no empty values', () => {
    for (const k of enKeys) {
      expect((en as Record<string, string>)[k].trim(), `en ${k}`).not.toBe('');
      expect((tr as Record<string, string>)[k].trim(), `tr ${k}`).not.toBe('');
    }
  });
  it('use the same {params} in both languages', () => {
    for (const k of enKeys) {
      expect(params((tr as Record<string, string>)[k]), k).toEqual(params((en as Record<string, string>)[k]));
    }
  });
  it('use the same glossary markup in both languages', () => {
    const marks = (s: string) => [...s.matchAll(/<t:([\w ]+)>/g)].map((m) => m[1]);
    for (const k of enKeys) expect(marks((tr as Record<string, string>)[k]), k).toEqual(marks((en as Record<string, string>)[k]));
  });
  it('give every plural base both forms', () => {
    for (const k of enKeys.filter((x) => x.endsWith('.one'))) expect(enKeys).toContain(k.replace(/\.one$/, '.other'));
  });
  // Keys used in code: `t()` takes `keyof Dict`, so a key that is not in en.ts is a compile error (npm run build).
  it('translate every case, object and glossary text', () => {
    setLang('tr', false);
    for (const c of CASES) for (const text of [c.nick, c.mission, c.goal, c.step]) expect(text.length).toBeGreaterThan(3);
    expect(CASES.map((c) => c.nick)).not.toEqual((setLang('en', false), CASES.map((c) => c.nick)));
    setLang('tr', false);
    expect(KNOWN.barnard.name).toBe('Barnard Yıldızı');
    expect(GLOSSARY.find((g) => g.id === 'RA')!.term).toMatch(/sağ açıklık/);
    expect(GLOSSARY.find((g) => g.id === 'Dec')!.term).toMatch(/dik açıklık/);
    setLang('en', false);
  });
});

describe('interpolation and plurals', () => {
  it('fills {name} and leaves unknown names alone', () => {
    expect(interpolate('Hello {name}, {n} items {x}', { name: 'Ada', n: 3 })).toBe('Hello Ada, 3 items {x}');
    expect(interpolate('no vars')).toBe('no vars');
  });
  it('picks the plural form: English has two, Turkish keeps the singular after a number', () => {
    expect(pluralCategory('en', 1)).toBe('one');
    expect(pluralCategory('en', 2)).toBe('other');
    expect(translatePlural('en', 'map.exposures', 1)).toBe('1 exposure');
    expect(translatePlural('en', 'map.exposures', 5)).toBe('5 exposures');
    expect(translatePlural('tr', 'map.exposures', 1)).toBe('1 poz');
    expect(translatePlural('tr', 'map.exposures', 5)).toBe('5 poz');
  });
  it('t falls back to the key for an unknown key instead of throwing', () => {
    expect(translate('en', 'nope.nope' as Key)).toBe('nope.nope');
  });
});

describe('numbers and dates', () => {
  it('uses a decimal point in English and a decimal comma in Turkish', () => {
    expect(num(10.24, 1, 'en')).toBe('10.2');
    expect(num(10.24, 1, 'tr')).toBe('10,2');
    expect(num(0.5, 2, 'tr')).toBe('0,50');
    expect(sig(0.01234, 2, 'tr')).toBe('0,012');
    expect(sig(0.01234, 2, 'en')).toBe('0.012');
  });
  // MJD 60902 = 15 Aug 2025, 60949 = 1 Oct 2025
  it('names months in each language and joins a window with an en dash', () => {
    expect(monthYear(60902.4, 'en')).toBe('Aug 2025');
    expect(monthYear(60902.4, 'tr')).toBe('Ağu 2025');
    expect(dateWindow(60902.865, 60949.2, 'en')).toBe('15 Aug – 1 Oct 2025');
    expect(dateWindow(60902.865, 60949.2, 'tr')).toBe('15 Ağu – 1 Eki 2025');
    expect(dateWindow(60902, 60907, 'tr')).toBe('15 – 20 Ağu 2025');
    expect(dateWindow(60902, 60902.5, 'en')).toBe('15 Aug 2025');
    expect(dateWindow(60900, 61100, 'tr')).toBe('13 Ağu 2025 – 1 Mar 2026');
    expect(dayMonthYear(60949, 'tr')).toBe('1 Eki 2025');
  });
  it('adds the day to the label when two visits share a month', () => {
    expect(visitLabels([60902.4, 61001], 'en')).toEqual(['Aug 2025', 'Nov 2025']);
    expect(visitLabels([60902.4, 60915.2, 61001], 'tr')).toEqual(['15 Ağu 2025', '28 Ağu 2025', 'Kas 2025']);
  });
  it('builds visit labels and windows from the MJD numbers, in the current language', () => {
    const eps = makeEpochs([
      { mjdStart: 60902.865, mjdEnd: 60949.2, mjd: 60921.4, imageCount: 5 },
      { mjdStart: 61000, mjdEnd: 61010, mjd: 61005, imageCount: 6 },
    ]);
    setLang('en', false);
    expect([eps[0].label, eps[0].dates]).toEqual(['Sep 2025', '15 Aug – 1 Oct 2025']);
    setLang('tr', false);
    expect([eps[0].label, eps[0].dates]).toEqual(['Eyl 2025', '15 Ağu – 1 Eki 2025']);
    expect(eps[1].label).toBe('Kas 2025');
    setLang('en', false);
  });
});

describe('language resolution', () => {
  it('the address beats the saved choice, which beats the browser', () => {
    expect(resolveLang({ saved: 'en', url: 'tr', browser: 'en-US' })).toBe('tr');
    expect(resolveLang({ saved: 'tr', url: 'en', browser: 'tr-TR' })).toBe('en');
    expect(resolveLang({ saved: 'en', url: null, browser: 'tr-TR' })).toBe('en');
    expect(resolveLang({ saved: 'tr', url: null, browser: 'en-US' })).toBe('tr');
    expect(resolveLang({ saved: null, url: 'en', browser: 'tr-TR' })).toBe('en');
    expect(resolveLang({ saved: null, url: 'TR', browser: 'en-US' })).toBe('tr');
    expect(resolveLang({ saved: null, url: null, browser: 'tr-TR' })).toBe('tr');
    expect(resolveLang({ saved: null, url: null, browser: 'tr' })).toBe('tr');
    expect(resolveLang({ saved: null, url: null, browser: 'de-DE' })).toBe('en');
    expect(resolveLang({})).toBe('en');
  });
  it('ignores values that are not a language', () => {
    expect(resolveLang({ saved: 'fr', url: 'xx', browser: 'tr-TR' })).toBe('tr');
    expect(LANG_KEY).toBe('skyquest.lang.v1');
  });
});

describe('sentences built in code', () => {
  beforeAll(() => setLang('en', false));
  afterAll(() => setLang('en', false));

  it('the same answer key gives different text in English and Turkish, with identical logic', () => {
    const patch = synthPatch([{ x: [20, 20, 20], y: [24, 22.5, 21], flux: [300, 300, 300] }]);
    const obj = { ...KNOWN.rwaur, ra: 100, dec: 20, snr: { D2: 100, D4: 50, D6: 10 } };
    setLang('en', false);
    const key = answerKey(patch, obj);
    const enText = truthText(key);
    setLang('tr', false);
    const trText = truthText(key);
    expect(key.truthParts.length).toBeGreaterThan(0);
    expect(trText).not.toBe(enText);
    expect(enText).toMatch(/Moved|No clear change|Brightness/);
    expect(trText).toMatch(/yer değiştirdi|değişim yok|Parlaklık/);
    // the key itself does not depend on the language
    setLang('en', false);
    const again = answerKey(patch, obj);
    expect(again.accepted).toEqual(key.accepted);
    expect(again.motionPx).toBe(key.motionPx);
  });

  it('measurement and verdict sentences follow the language', () => {
    const patch = synthPatch([{ x: [20, 20, 20], y: [24, 22.5, 21], flux: [300, 300, 300] }]);
    const m = measureSource(patch, 2, { x: 20, y: 21 });
    setLang('en', false);
    expect(describeMeasurement(m)).toMatch(/moved \d/);
    setLang('tr', false);
    expect(describeMeasurement(m)).toMatch(/yay saniyesi yer değiştirdi/);
    expect(describeMeasurement(m)).toMatch(/\d,\d/);
    const v = checkCatalogue(patch, m, []);
    expect(verdictText(v)).toMatch(/Katalogda eşleşme yok/);
    setLang('en', false);
    expect(verdictText(v)).toMatch(/No catalogue match/);
  });

  it('server error codes map to our own messages; an unknown code shows the server text', () => {
    setLang('en', false);
    for (const code of ['no_coverage', 'archive_unavailable', 'internal_error', 'bad_input']) {
      const msg = errorText(new DataError('server', { code, serverMessage: 'SERVER ENGLISH' }));
      expect(msg).not.toBe('SERVER ENGLISH');
      expect(msg.length).toBeGreaterThan(10);
    }
    expect(errorText(new DataError('server', { code: 'weird', serverMessage: 'Something odd happened' }))).toBe('Something odd happened');
    expect(errorText(new DataError('timeout'))).toMatch(/much longer/);
    setLang('tr', false);
    expect(errorText(new DataError('timeout'))).toMatch(/çok daha uzun/);
    expect(errorText(new DataError('unreachable'))).toBe(t('err.unreachable'));
    expect(errorText(new DataError('incomplete'))).toMatch(/eksik/);
    setLang('en', false);
  });
});
