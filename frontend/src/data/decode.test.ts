import { beforeAll, describe, expect, it, vi } from 'vitest';
import { setLang } from '../i18n';

beforeAll(() => setLang('en', false));
import { bytesToBase64, decodeFloat32, decodeUint8, encodeFloat32 } from './decode';
import { convertPatch, createRealProvider, FLAG_SHARE_THRESHOLD, type PatchPayload } from './realProvider';

const frame = (vals: number[], share: number[], noise: number, n = 10) => ({
  data: encodeFloat32(vals), flag_share: bytesToBase64(Uint8Array.from(share)), noise, n_images: n,
});

/** 2x2 payload in the contract format: 3 detectors, 2 epochs, one null frame, one masked pixel. */
function payload(): PatchPayload {
  return {
    status: 'done', id: 'x', source: 'irsa', center: { ra: 10, dec: 5 }, fov_deg: 0.1, size: 2,
    pixel_scale_arcsec: 3.075,
    epochs: [
      { index: 0, mjd_start: 1, mjd_end: 3, mjd_mean: 2, label: 'A', dates: '1-3', n_images: { '2': 5, '4': 6, '6': 7 } },
      { index: 1, mjd_start: 11, mjd_end: 13, mjd_mean: 12, label: 'B', dates: '11-13', n_images: { '2': 1, '4': 2 } },
    ],
    bands: [{ detector: 2, wavelength_um: [1.1, 1.6] }, { detector: 4, wavelength_um: [2.4, 3.8] }, { detector: 6, wavelength_um: [4.4, 5] }],
    frames: [
      [frame([1, 2, 3, 4], [0, 50, 51, 255], 0.5), frame([0, 0, 0, 0], [0, 0, 0, 0], 1), frame([8, NaN, 2, 1], [0, 0, 0, 0], 2)],
      [frame([2, 2, 2, 2], [0, 0, 0, 0], 1), frame([1, 1, 1, 1], [0, 0, 0, 0], 1), null],
    ],
  };
}

describe('decode', () => {
  it('round-trips float32 and uint8', () => {
    const vals = [0, 1.5, -2.25, 1e-3, NaN];
    const back = decodeFloat32(encodeFloat32(vals));
    expect(Array.from(back).slice(0, 4)).toEqual(vals.slice(0, 4).map((v) => Math.fround(v)));
    expect(Number.isNaN(back[4])).toBe(true);
    expect(Array.from(decodeUint8(bytesToBase64(Uint8Array.from([0, 7, 255]))))).toEqual([0, 7, 255]);
  });
  it('is little-endian', () => {
    expect(decodeFloat32(bytesToBase64(Uint8Array.from([0, 0, 0x80, 0x3f])))[0]).toBe(1);
  });
  it('rejects the wrong pixel count', () => {
    expect(() => decodeFloat32(encodeFloat32([1, 2, 3]), 4)).toThrow();
  });
});

describe('convertPatch', () => {
  const p = convertPatch(payload());
  it('keeps display order (row 0 = north) untouched', () => {
    expect(p.frames[0][0][3]).toBeGreaterThan(p.frames[0][0][0]);
    expect(p.size).toBe(2);
    expect(p.pixelScale).toBe(3.075);
    expect(p.source).toBe('irsa');
  });
  it('divides by the median noise', () => {
    // noises: 0.5, 1, 2, 1, 1 -> median 1
    expect(p.frames[0][0][1]).toBeCloseTo(2);
    expect(p.noise[0][0]).toBeCloseTo(0.5);
    expect(p.noise[0][2]).toBeCloseTo(2);
  });
  it('flags share >= 51 and masked pixels; masked becomes 0', () => {
    expect(FLAG_SHARE_THRESHOLD).toBe(51);
    expect(Array.from(p.flags[0][0])).toEqual([0, 0, 1, 1]);
    expect(p.frames[0][2][1]).toBe(0);
    expect(p.flags[0][2][1]).toBe(1);
  });
  it('turns a null frame into a flagged empty frame and records it as missing', () => {
    expect(p.missing![1][2]).toBe(true);
    expect(Array.from(p.flags[1][2])).toEqual([1, 1, 1, 1]);
    expect(Array.from(p.frames[1][2])).toEqual([0, 0, 0, 0]);
    expect(p.missing![0][0]).toBe(false);
  });
  it('maps epochs and bands', () => {
    expect(p.bands.map((b) => b.id)).toEqual(['D2', 'D4', 'D6']);
    // The label comes from the MJD numbers (MJD 2 and 12 share a month, so the day is added), never from the server's `label`.
    expect(p.epochs[0]).toMatchObject({ label: '19 Nov 1858', mjd: 2, imageCount: 18 });
    expect(p.epochs[1].imageCount).toBe(3);
  });
});

describe('convertPatch with an unmeasurable noise', () => {
  it('counts a null noise as the reference noise instead of 0', () => {
    const pl = payload();
    pl.frames![0][0]!.noise = null;
    const q = convertPatch(pl);
    expect(q.noise[0][0]).toBe(1);
    expect(q.noise.flat().every((v) => Number.isFinite(v) && v > 0)).toBe(true);
  });
});

describe('createRealProvider', () => {
  it('polls 202 then returns the patch, reporting steps', async () => {
    const answers = [
      { status: 202, body: { status: 'queued', progress: { total: 10, done: 0, failed: 0 } } },
      { status: 202, body: { status: 'running', progress: { total: 10, done: 5, failed: 0 } } },
      { status: 202, body: { status: 'running', progress: { total: 10, done: 9, failed: 0 } } },
      { status: 200, body: payload() },
    ];
    const fetchImpl = vi.fn(async () => {
      const a = answers.shift()!;
      return { status: a.status, ok: true, json: async () => a.body } as unknown as Response;
    });
    const steps: string[] = [];
    const patch = await createRealProvider({ base: '', fetchImpl: fetchImpl as unknown as typeof fetch, pollMs: 1 })
      .getPatch({ ra: 10, dec: 5, fovDeg: 0.1 }, (s) => steps.push(s));
    expect(patch.source).toBe('irsa');
    expect(steps).toEqual(['finding', 'finding', 'downloading', 'stacking', 'done']);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
  it('gives up with a friendly error', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 202, ok: true, json: async () => ({ status: 'running' }) }) as unknown as Response);
    await expect(createRealProvider({ base: '', fetchImpl: fetchImpl as unknown as typeof fetch, pollMs: 1, timeoutMs: 10 })
      .getPatch({ ra: 1, dec: 1, fovDeg: 0.1, cached: true })).rejects.toMatchObject({ kind: 'timeout' });
  });
});
