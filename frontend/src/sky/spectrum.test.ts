import { beforeAll, describe, expect, it } from 'vitest';
import { adaptChannels, channelLayout, findBlends, summarize } from './spectrum';
import { fmtTick } from './charts';
import type { CatalogueSource } from './catalogue';
import { fetchSpectrum } from '../data/spectrumApi';
import { setLang } from '../i18n';

beforeAll(() => setLang('en', false));

const ch = (detector: number, index: number, w: number, extra: Record<string, unknown> = {}) => ({
  detector, index, wavelength_um: w, wavelength_range_um: [w - 0.01, w + 0.01],
  flux_mjy: 1, err_mjy: 0.1, n_exposures: 3, n_skipped: 0, saturated: false, lower_limit: false, ...extra,
});
const body = (channels: unknown[], warnings: unknown = ['w1']) => ({ center: { ra: 10, dec: 20 }, aperture_px: 2, unit: 'mJy', channels, warnings });

describe('adaptChannels', () => {
  it('keeps null channels as gaps and reads lower limits, counts and warnings', () => {
    const s = adaptChannels(body([
      ch(1, 0, 0.75),
      ch(1, 1, 0.77, { flux_mjy: null, err_mjy: null, n_exposures: 0, n_skipped: 2 }),
      ch(1, 2, 0.79, { saturated: true, lower_limit: true }),
      ch(1, 3, 0.81, { lower_limit: true }),
    ]))!;
    expect(s.channels).toHaveLength(4);
    expect(s.channels[1]).toMatchObject({ flux: null, err: null, nSkipped: 2 });
    expect(s.channels[2]).toMatchObject({ saturated: true, lowerLimit: true });
    expect(s.channels[3]).toMatchObject({ saturated: false, lowerLimit: true });
    expect(s.warnings).toEqual(['w1']);
    expect(s.aperturePx).toBe(2);
    expect(summarize(s.channels)).toMatchObject({ total: 4, withValue: 3, empty: 1, saturated: 1, lowerLimits: 2, exposures: 9, skipped: 2 });
  });
  it('sorts by wavelength, drops rows without a wavelength, and rejects other shapes', () => {
    const s = adaptChannels(body([ch(2, 0, 1.2), { detector: 1, flux_mjy: 3 }, ch(1, 0, 0.8)]))!;
    expect(s.channels.map((c) => c.wavelengthUm)).toEqual([0.8, 1.2]);
    expect(adaptChannels(null)).toBeNull();
    expect(adaptChannels([])).toBeNull();
    expect(adaptChannels({ channels: 'x' })).toBeNull();
    expect(adaptChannels(body([ch(1, 0, 1)], 'nope'))!.warnings).toEqual([]);
  });
  it('does not turn a non-finite flux into zero', () => {
    const s = adaptChannels(body([ch(1, 0, 1, { flux_mjy: 'NaN' })]))!;
    expect(s.channels[0].flux).toBeNull();
  });
});

describe('channelLayout', () => {
  it('breaks the line at a missing channel and marks lower limits hollow', () => {
    const s = adaptChannels(body([
      ch(1, 0, 0.75), ch(1, 1, 0.77), ch(1, 2, 0.79, { flux_mjy: null, err_mjy: null }), ch(1, 3, 0.81), ch(1, 4, 0.83, { lower_limit: true }),
      ch(2, 0, 1.2), ch(2, 1, 1.3),
    ]))!;
    const lay = channelLayout(s.channels, fmtTick);
    expect(lay.markers).toHaveLength(6);
    expect(lay.gaps).toHaveLength(1);
    expect(lay.markers.filter((m) => m.hollow)).toHaveLength(1);
    // D1 run of 2, D1 run of 2 after the gap, D2 run of 2: three polylines, none across the gap
    expect(lay.lines).toHaveLength(3);
  });
  it('copes with no value at all', () => {
    const s = adaptChannels(body([ch(1, 0, 0.75, { flux_mjy: null, err_mjy: null })]))!;
    const lay = channelLayout(s.channels, fmtTick);
    expect(lay.markers).toHaveLength(0);
    expect(lay.gaps).toHaveLength(1);
  });
});

describe('findBlends', () => {
  const at = { ra: 133.759871, dec: -7.242252 };
  const src = (name: string, dRaArc: number, dDecArc: number, origin: 'gaia' | 'wise' | 'known' = 'gaia'): CatalogueSource => ({
    id: name, name, ra: at.ra + dRaArc / 3600 / Math.cos((at.dec * Math.PI) / 180), dec: at.dec + dDecArc / 3600, pmRa: 0, pmDec: 0, gmag: 16.3, origin,
  });
  it('finds a neighbour inside the aperture and not outside it (7.3 arcsec: in at 2 px, out at 1 px)', () => {
    const neighbour = src('G', 7.3, 0);
    expect(findBlends(at, 2, [neighbour], 2026)).toHaveLength(1);
    expect(findBlends(at, 2, [neighbour], 2026)[0].distArcsec).toBeCloseTo(7.3, 1);
    expect(findBlends(at, 1, [neighbour], 2026)).toHaveLength(0);
    expect(findBlends(at, 3, [src('far', 20, 0)], 2026)).toHaveLength(0);
  });
  it('does not count the target itself or the built-in practice objects', () => {
    expect(findBlends(at, 2, [src('self', 1.5, 0), src('known', 6, 0, 'known')], 2026)).toHaveLength(0);
  });
  it('moves proper-motion sources to the date of the picture and sorts nearest first', () => {
    // 30 arcsec north at 2026.0, moving 10 arcsec south per year: 20 arcsec north in 2027, 5 arcsec north in 2028.5
    const mover: CatalogueSource = { ...src('M', 0, 30), pmDec: -10000 };
    expect(findBlends(at, 2, [mover], 2026)).toHaveLength(0);
    expect(findBlends(at, 2, [mover], 2028.5).map((b) => Math.round(b.distArcsec))).toEqual([5]);
    const both = findBlends(at, 3, [src('far', 15, 0), src('near', 5, 0, 'wise')], 2026);
    expect(both.map((b) => b.source.name)).toEqual(['near', 'far']);
  });
});

describe('fetchSpectrum', () => {
  const reply = (status: number, json: unknown) => (async () => ({ ok: status < 300, status, json: async () => json })) as unknown as typeof fetch;
  it('asks for mode=102 and the aperture, and decodes the answer', async () => {
    let url = '';
    const f = (async (u: string) => { url = u; return { ok: true, status: 200, json: async () => body([ch(1, 0, 0.75)]) }; }) as unknown as typeof fetch;
    const r = await fetchSpectrum(1, 2, 'binned', 3, '', f);
    expect(url).toContain('mode=102');
    expect(url).toContain('aperture=3');
    expect(r.kind).toBe('binned');
  });
  it('404 no_coverage is its own state; other 404, 5xx and a broken body are errors', async () => {
    expect((await fetchSpectrum(1, 2, 'binned', 2, '', reply(404, { error: { code: 'no_coverage', message: 'x' } }))).kind).toBe('nocoverage');
    expect((await fetchSpectrum(1, 2, 'binned', 2, '', reply(404, { detail: 'Not Found' }))).kind).toBe('error');
    expect((await fetchSpectrum(1, 2, 'binned', 2, '', reply(502, {}))).kind).toBe('error');
    expect((await fetchSpectrum(1, 2, 'binned', 2, '', reply(200, { nope: 1 }))).kind).toBe('error');
    expect((await fetchSpectrum(1, 2, 'all', 2, '', reply(200, { nope: 1 }))).kind).toBe('error');
    const boom = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect((await fetchSpectrum(1, 2, 'binned', 2, '', boom)).kind).toBe('error');
  });
});
