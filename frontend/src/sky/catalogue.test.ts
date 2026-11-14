import { beforeAll, describe, expect, it } from 'vitest';
import { checkCatalogue, inField, knownAsCatalogue, motionArcsecPerYear, sourceAt, sourcePixels, verdictText, type CatalogueSource } from './catalogue';
import { setLang } from '../i18n';
import { measureSource } from './measure';
import { mjdToYear, pixelToSky } from './astro';
import { synthPatch } from '../test/synth';
import { adaptGaia } from '../data/gaiaApi';

beforeAll(() => setLang('en', false));

const star = (ra: number, dec: number, pmRa: number, pmDec: number): CatalogueSource =>
  ({ id: 's', name: 'DR3 1', ra, dec, pmRa, pmDec, gmag: 12, origin: 'gaia' });

describe('propagation', () => {
  it('moves a star north with positive pmDec and east with positive pmRa', () => {
    const s = star(100, 20, 1000, 2000);
    const later = sourceAt(s, 2028);
    expect(later.dec - s.dec).toBeCloseTo((2000 * 2) / 3.6e6, 9);
    expect(later.ra).toBeGreaterThan(s.ra);
    expect(sourceAt(s, 2026)).toEqual({ ra: 100, dec: 20 });
  });
  it('gives pixel marks that follow the star toward smaller rows when moving north', () => {
    const patch = synthPatch([]);
    const s = star(patch.center.ra, patch.center.dec, 0, 2000);
    const px = sourcePixels(patch, s);
    expect(px[0].y).toBeGreaterThan(px[2].y);
    expect(motionArcsecPerYear(s)).toBeCloseTo(2);
  });
  it('known objects fall back to catalog.ts', () => {
    const k = knownAsCatalogue();
    expect(k).toHaveLength(5);
    expect(k.find((o) => o.id === 'barnard')!.pmDec).toBe(10362);
  });
  it('adapts Gaia rows and ignores broken ones', () => {
    const out = adaptGaia([{ source_id: '42', ra: 1, dec: 2, gmag: 11, pmra: 5, pmdec: null }, { foo: 1 }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ pmRa: 5, pmDec: 0, origin: 'gaia' });
    expect(adaptGaia(null)).toEqual([]);
  });
});

describe('checkCatalogue', () => {
  // the blob moves 3 pixels north over the whole span (400 days)
  const patch = synthPatch([{ x: [20, 20, 20], y: [24, 22.5, 21], flux: [300, 300, 300] }]);
  const m = measureSource(patch, 2, { x: 20, y: 21 });
  const last = pixelToSky(patch, 20, 21);
  const years = (patch.epochs[2].mjd - patch.epochs[0].mjd) / 365.25;
  const pmDec = ((3 * 6.15) / years) * 1000; // mas/yr
  const y2026 = mjdToYear(patch.epochs[2].mjd);
  const atEpoch = star(last.ra, last.dec - (pmDec * (y2026 - 2026)) / 3.6e6, 0, pmDec);

  it('matches a known star with the same motion', () => {
    const v = checkCatalogue(patch, m, [atEpoch]);
    expect(v.kind).toBe('match');
    expect(verdictText(v)).toMatch(/Known/);
    expect(verdictText(v)).toMatch(/matches what you measured/);
  });
  it('does not call a star with the opposite motion a match', () => {
    const wrong = star(last.ra, last.dec + (pmDec * (y2026 - 2026)) / 3.6e6, 0, -pmDec);
    const v = checkCatalogue(patch, m, [wrong]);
    expect(v.kind).not.toBe('match');
  });
  it('says no match for an empty catalogue, suggesting something new', () => {
    const v = checkCatalogue(patch, m, []);
    expect(v.kind).toBe('none');
    expect(v.candidate).toBe(true);
    expect(verdictText(v)).toMatch(/something new/);
  });
  it('filters sources to the field', () => {
    expect(inField(patch, [atEpoch, star(10, -50, 0, 0)])).toHaveLength(1);
  });
});
