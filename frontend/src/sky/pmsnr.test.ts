import { beforeAll, describe, expect, it } from 'vitest';
import { checkCatalogue, PM_SNR_MIN, pmUnreliable, verdictText, type CatalogueSource } from './catalogue';
import { setLang } from '../i18n';
import { measureSource } from './measure';
import { mjdToYear, pixelToSky } from './astro';
import { synthPatch } from '../test/synth';
import { adaptGaia } from '../data/gaiaApi';
import { wiseMarks, isFastMover } from './wiseMarks';

beforeAll(() => setLang('en', false));

const star = (ra: number, dec: number, pmRa: number, pmDec: number): CatalogueSource =>
  ({ id: 's', name: 'DR3 1', ra, dec, pmRa, pmDec, gmag: 12, origin: 'gaia' });

describe('proper-motion significance (pm_snr)', () => {
  const patch = synthPatch([{ x: [20, 20, 20], y: [24, 22.5, 21], flux: [300, 300, 300] }]);
  const m = measureSource(patch, 2, { x: 20, y: 21 });
  const last = pixelToSky(patch, 20, 21);
  const years = (patch.epochs[2].mjd - patch.epochs[0].mjd) / 365.25;
  const pmDec = ((3 * 6.15) / years) * 1000;
  const y2026 = mjdToYear(patch.epochs[2].mjd);
  const base = star(last.ra, last.dec - (pmDec * (y2026 - 2026)) / 3.6e6, 0, pmDec);

  it('thresholds: below 3 is unreliable; 3 and above and unknown are not', () => {
    expect(pmUnreliable({ pmSnr: 2.99 })).toBe(true);
    expect(pmUnreliable({ pmSnr: 0 })).toBe(true);
    expect(pmUnreliable({ pmSnr: PM_SNR_MIN })).toBe(false);
    expect(pmUnreliable({ pmSnr: 42 })).toBe(false);
    expect(pmUnreliable({ pmSnr: null })).toBe(false);
    expect(pmUnreliable({})).toBe(false);
  });
  it('never claims agreement with a catalogue motion that is not significant', () => {
    const v = checkCatalogue(patch, m, [{ ...base, pmSnr: 1.2 }]);
    expect(v.kind).toBe('weak');
    expect(v.candidate).toBe(true);
    expect(verdictText(v)).toMatch(/not reliable/);
    expect(verdictText(v)).not.toMatch(/matches what you measured/);
  });
  it('still matches when the motion is significant', () => {
    expect(checkCatalogue(patch, m, [{ ...base, pmSnr: 25 }]).kind).toBe('match');
  });
  it('adapts pm_snr from Gaia rows, null when unknown', () => {
    const out = adaptGaia([{ source_id: '1', ra: 1, dec: 2, pm_snr: 4.5 }, { source_id: '2', ra: 1, dec: 2, pm_snr: null }, { source_id: '3', ra: 1, dec: 2 }]);
    expect(out.map((s) => s.pmSnr)).toEqual([4.5, null, null]);
  });
});

describe('WISE marks', () => {
  const patch = synthPatch([]);
  const wise = (id: string, dRa: number, dDec: number, pmRa: number, pmDec: number, w2: number, pmSnr: number | null): CatalogueSource => ({
    id, name: id, ra: patch.center.ra + dRa / 3600, dec: patch.center.dec + dDec / 3600, pmRa, pmDec, gmag: null, w1: null, w2, pmSnr, origin: 'wise',
  });
  it('shows every entry (near-duplicates too), puts significant fast movers first, and draws arrows only for reliable motion', () => {
    const list = [
      wise('faint-still', 10, 10, 5, 5, 17, 0.5),
      wise('fast-a', 0, 0, -7900, 500, 15.5, 52),
      wise('fast-b', 1.5, 0.5, -7965, 800, 15.7, 42),
      wise('fast-noisy', -20, 0, -3000, 0, 12, 1.1),
    ];
    const marks = wiseMarks(patch, 0, list);
    expect(marks.inView).toHaveLength(4);
    expect(marks.rings).toHaveLength(4);
    expect(marks.rings.every((r) => r.square)).toBe(true);
    expect(marks.inView.slice(0, 2).map((s) => s.id)).toEqual(['fast-a', 'fast-b']);
    expect(marks.arrows).toHaveLength(2);
    expect(isFastMover(list[3])).toBe(false);
  });
  it('ignores non-WISE sources', () => {
    expect(wiseMarks(patch, 0, [star(patch.center.ra, patch.center.dec, 0, 0)]).rings).toHaveLength(0);
  });
});
