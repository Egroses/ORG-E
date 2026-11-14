import { describe, expect, it } from 'vitest';
import { convertPatch, DETECTOR_BAND, type PatchPayload } from './data/realProvider';
import { ALL_BANDS, BANDS } from './data/catalog';
import { encodeFloat32, bytesToBase64 } from './data/decode';
import { aperturePhotometry, bandRatio, fieldShares, fluxSeries, mjySrPixToMilliJy, photometryTable, positionAngle, positionsByVisit } from './sky/photometry';
import { fluxChartLayout, adaptSpectrum, spectrumChartLayout, niceTicks } from './sky/charts';
import { noDataColor, paintImage, stretchInverse, stretchUnit, maskedMean, percentileStretch } from './sky/render';
import { DEFAULT_REALISTIC, parseRealistic, realisticPairs } from './state/viewState';
import { fetchSpectrum } from './data/spectrumApi';
import { realisticRequest } from './data/provider';
import { synthPatch } from './test/synth';

const SIZE = 9;
function payload(): PatchPayload {
  const vals = new Float32Array(SIZE * SIZE).fill(0.5);
  vals[0] = NaN;
  const share = new Uint8Array(SIZE * SIZE);
  share[1] = 255;
  const frame = { data: encodeFloat32(vals), noise: 0.1, flag_share: bytesToBase64(share), n_images: 7 };
  return {
    status: 'done', center: { ra: 10, dec: 10 }, fov_deg: 0.1, size: SIZE, pixel_scale_arcsec: 3.075,
    epochs: [{ index: 0, mjd_start: 60000, mjd_end: 60010, mjd_mean: 60005, label: 'A', dates: 'd', n_images: { '1': 7, '6': 7 } }],
    bands: [{ detector: 1, wavelength_um: [0.75, 1.1] }, { detector: 6, wavelength_um: [4.4, 5] }],
    frames: [[frame, null]],
    data_release: { collections: { dr1: 14, qr3: 0 }, latest_mjd: 60010 },
  };
}

describe('six bands', () => {
  it('maps detectors 1-6 and keeps the game on three', () => {
    expect(Object.keys(DETECTOR_BAND)).toHaveLength(6);
    expect(DETECTOR_BAND[5]).toBe('D5');
    expect(ALL_BANDS.map((b) => b.rangeUm[0])).toEqual([0.75, 1.1, 1.6, 2.4, 3.8, 4.4]);
    expect(BANDS.map((b) => b.id)).toEqual(['D2', 'D4', 'D6']);
  });
  it('requests all six detectors in Realistic mode, strictly', () => {
    const r = realisticRequest(1, 2, 0.1, 'fine');
    expect(r.dets).toEqual([1, 2, 3, 4, 5, 6]);
    expect([r.gapDays, r.maxSpanDays]).toEqual([10, 30]);
    expect(r.strict).toBe(true);
  });
});

describe('physical units and flags', () => {
  const p = convertPatch(payload());
  it('keeps the noise reference so value * ref is MJy/sr', () => {
    expect(p.noiseRefMJySr).toBeCloseTo(0.1);
    expect(p.frames[0][0][5] * p.noiseRefMJySr!).toBeCloseTo(0.5, 5);
  });
  it('keeps raw flag share, no-data mask, holes and data release', () => {
    expect(p.flagShare![0][0][1]).toBe(255);
    expect(p.nodata![0][0][0]).toBe(1);
    expect(p.nodata![0][0][5]).toBe(0);
    expect(p.missing![0][1]).toBe(true);
    expect(p.nodata![0][1].every((v) => v === 1)).toBe(true);
    expect(p.dataRelease!.collections.dr1).toBe(14);
  });
  it('computes field shares', () => {
    const s = fieldShares(p, 0, 0)!;
    expect(s.nodata).toBeCloseTo(1 / 81);
    expect(s.flagged).toBeCloseTo(1 / 81);
    expect(fieldShares(p, 0, 1)).toBeNull();
  });
});

describe('no-data rendering', () => {
  it('paints masked pixels as hatched grey, never black', () => {
    const img = { data: new Uint8ClampedArray(4 * 4 * 4) } as ImageData;
    const data = new Float32Array(16);
    const mask = new Uint8Array(16);
    mask[0] = 1; mask[2] = 1;
    paintImage(img, data, { lo: 0, hi: 1, soft: 0.1 }, [255, 255, 255], false, mask);
    expect(Array.from(img.data.slice(0, 3))).toEqual(noDataColor(0, 0));
    expect(noDataColor(0, 0)).not.toEqual(noDataColor(2, 0));
    expect(Math.min(...noDataColor(0, 0))).toBeGreaterThan(60);
    expect(img.data[4 * 1]).toBeLessThan(20); // an ordinary empty pixel stays dark
  });
  it('stacks ignoring masked pixels', () => {
    const m = maskedMean([new Float32Array([2, 4]), new Float32Array([6, 0])], [undefined, new Uint8Array([0, 1])]);
    expect(Array.from(m.data)).toEqual([4, 4]);
    const none = maskedMean([new Float32Array([1])], [new Uint8Array([1])]);
    expect(none.nodata[0]).toBe(1);
  });
});

describe('stretch', () => {
  it('inverse undoes the stretch for every function', () => {
    for (const fn of ['linear', 'asinh', 'sqrt', 'log'] as const) {
      const s = { lo: -1, hi: 9, soft: 0.5, fn };
      for (const v of [0, 2, 5, 8.5]) expect(stretchInverse(stretchUnit(v, s), s)).toBeCloseTo(v, 6);
    }
  });
  it('percentile cuts skip masked pixels', () => {
    const s = percentileStretch([new Float32Array([0, 1, 2, 3, 1000])], [new Uint8Array([0, 0, 0, 0, 1])], 0, 100, 'linear', 0.1);
    expect(s.hi).toBeLessThan(10);
  });
});

describe('photometry', () => {
  const patch = synthPatch([{ x: [20, 20, 20], y: [20, 20, 20], flux: [100, 100, 100] }]);
  patch.noiseRefMJySr = 0.01;
  it('converts MJy/sr pixels to mJy', () => {
    // one pixel of 1 MJy/sr over 3.075" x 3.075": 2.22e-10 sr -> 0.222 mJy
    expect(mjySrPixToMilliJy(1, 3.075)).toBeCloseTo(0.2222, 3);
  });
  it('measures flux with uncertainty and no limit for a clean aperture', () => {
    const c = aperturePhotometry(patch, 0, 0, { x: 20, y: 20 });
    expect(c.status).toBe('ok');
    expect(c.sumMJySrPix).toBeGreaterThan(0.5);
    expect(c.errMJy).toBeGreaterThan(0);
    expect(c.lowerLimit).toBe(false);
  });
  it('marks a saturated aperture as a lower limit', () => {
    const sat = synthPatch([{ x: [20, 20, 20], y: [20, 20, 20], flux: [100, 100, 100] }]);
    sat.noiseRefMJySr = 0.01;
    sat.flagShare = sat.frames.map((f) => f.map(() => new Uint8Array(sat.size * sat.size).fill(255)));
    const c = aperturePhotometry(sat, 0, 0, { x: 20, y: 20 });
    expect(c.flaggedShare).toBe(1);
    expect(c.lowerLimit).toBe(true);
  });
  it('treats a hole as no photo and builds a table, series and ratios', () => {
    const h = synthPatch([{ x: [20, 20, 20], y: [20, 20, 20], flux: [100, 200, 300] }]);
    h.noiseRefMJySr = 0.01;
    h.missing = h.epochs.map((_, e) => h.bands.map(() => e === 1));
    const t = photometryTable(h, positionsByVisit(h, { x: 20, y: 20 }, null));
    expect(t[0][1].status).toBe('nophoto');
    const s = fluxSeries(h, t);
    expect(s[0].points.map((p) => p.epoch)).toEqual([0, 2]);
    const r = bandRatio(t, 0, 1);
    expect(r[1].value).toBeNull();
    expect(r[0].value).toBeGreaterThan(0);
  });
  it('position angle', () => {
    expect(positionAngle(0, 1)).toBeCloseTo(0);
    expect(positionAngle(1, 0)).toBeCloseTo(90);
    expect(positionAngle(-1, 0)).toBeCloseTo(270);
  });
});

describe('charts', () => {
  it('lays out flux points in date order inside the plot, lower limits hollow', () => {
    const lay = fluxChartLayout([{ bandIndex: 0, bandId: 'D1', color: '#fff', points: [
      { mjd: 60000, epoch: 0, flux: 10, err: 1, lowerLimit: false },
      { mjd: 60200, epoch: 1, flux: 20, err: 2, lowerLimit: true },
    ] }]);
    expect(lay.markers).toHaveLength(2);
    expect(lay.markers[1].cx).toBeGreaterThan(lay.markers[0].cx);
    expect(lay.markers[1].cy).toBeLessThan(lay.markers[0].cy);
    expect(lay.markers.map((m) => m.hollow)).toEqual([false, true]);
    expect(lay.lines).toHaveLength(1);
  });
  it('spectrum: fake response, flagged points hollow (never tried against the real backend)', async () => {
    const fake = [
      { wavelength_um: 3.1, flux_mjy: 5, err_mjy: 0.5, flagged: true },
      { wavelength_um: 1.2, flux_mjy: 2, err_mjy: 0.2, flagged: false },
      { wavelength_um: 'x', flux_mjy: 1 },
    ];
    const pts = await fetchSpectrum(1, 2, '', (async () => ({ ok: true, json: async () => fake })) as unknown as typeof fetch);
    expect(pts).toHaveLength(2);
    expect(pts![0].wavelength_um).toBe(1.2);
    const lay = spectrumChartLayout(pts!);
    expect(lay.markers.map((m) => m.hollow)).toEqual([false, true]);
    expect(await fetchSpectrum(1, 2, '', (async () => ({ ok: false })) as unknown as typeof fetch)).toBeNull();
    expect(adaptSpectrum('nope')).toEqual([]);
  });
  it('nice ticks', () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
  });
});

describe('URL state', () => {
  it('round trips', () => {
    const s = { ...DEFAULT_REALISTIC, band: 'D5' as const, visit: 2, ref: 0, mode: 'diff' as const, stretch: 'log' as const, lo: 2, hi: 99, group: 'coarse' as const, quality: 'flagshare' as const };
    const q = new URLSearchParams(realisticPairs(s));
    expect(q.get('view')).toBe('realistic');
    expect(parseRealistic(q)).toEqual(s);
  });
  it('defaults stay out of the link and bad values fall back', () => {
    expect(realisticPairs(DEFAULT_REALISTIC)).toEqual([['view', 'realistic']]);
    const p = parseRealistic(new URLSearchParams('band=D9&stretch=x&lo=50&hi=51&visit=0'));
    expect(p.band).toBeUndefined();
    expect(p.stretch).toBe('asinh');
    expect(p.visit).toBeUndefined();
  });
});
