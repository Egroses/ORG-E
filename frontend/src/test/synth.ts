import type { SkyPatch } from '../data/types';
import { BANDS } from '../data/catalog';
import { makeEpochs } from '../data/epochs';

export interface Blob { x: number[]; y: number[]; flux: number[] }

/** Seeded noise so tests are repeatable. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A small synthetic patch: Gaussian blobs (one position and flux per epoch), unit noise. Pixel scale 6.15 arcsec. */
export function synthPatch(blobs: Blob[], opts: { size?: number; mjds?: number[]; noise?: number } = {}): SkyPatch {
  const size = opts.size ?? 41;
  const mjds = opts.mjds ?? [60800, 61000, 61200];
  const sigmaN = opts.noise ?? 1;
  const r = rng(7);
  const frames: Float32Array[][] = [];
  const flags: Uint8Array[][] = [];
  const noise: number[][] = [];
  mjds.forEach((_, e) => {
    const fr: Float32Array[] = [];
    const fl: Uint8Array[] = [];
    const nz: number[] = [];
    BANDS.forEach(() => {
      const img = new Float32Array(size * size);
      for (let i = 0; i < img.length; i++) img[i] = sigmaN * (r() + r() + r() + r() - 2) * 1.7;
      for (const b of blobs) {
        for (let j = 0; j < size; j++) {
          for (let i = 0; i < size; i++) {
            const d2 = (i - b.x[e]) ** 2 + (j - b.y[e]) ** 2;
            img[j * size + i] += (b.flux[e] / (2 * Math.PI * 0.8 * 0.8)) * Math.exp(-d2 / (2 * 0.8 * 0.8));
          }
        }
      }
      fr.push(img);
      fl.push(new Uint8Array(size * size));
      nz.push(sigmaN);
    });
    frames.push(fr);
    flags.push(fl);
    noise.push(nz);
  });
  return {
    center: { ra: 100, dec: 20 }, fovDeg: (size * 6.15) / 3600, size, pixelScale: 6.15,
    epochs: makeEpochs(mjds.map((m) => ({ mjdStart: m - 2, mjdEnd: m + 2, mjd: m, imageCount: 10 }))),
    bands: BANDS, frames, flags, noise, source: 'mock',
  };
}
