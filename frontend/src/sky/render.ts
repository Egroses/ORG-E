import type { Detail } from '../data/types';

export type StretchFn = 'asinh' | 'linear' | 'sqrt' | 'log';
export interface Stretch { lo: number; hi: number; soft: number; fn?: StretchFn }

// Neutral near-black sky background (was indigo; the redesign uses a neutral scientific look).
const BG: [number, number, number] = [9, 10, 13];

function percentile(arrays: Float32Array[], p: number) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const step = Math.max(1, Math.floor(total / 40000));
  const sample: number[] = [];
  for (const a of arrays) for (let i = 0; i < a.length; i += step) sample.push(a[i]);
  sample.sort((x, y) => x - y);
  return sample[Math.min(sample.length - 1, Math.floor(p * sample.length))];
}

/**
 * One stretch shared by every epoch, so brightness changes are never manufactured by display scaling.
 * `noise` should be the largest per-epoch noise for this band, so the black point sits above it.
 */
export function sharedStretch(frames: Float32Array[], noise: number, detail: Detail): Stretch {
  if (detail === 'faint') {
    return { lo: 0.2 * noise, hi: Math.max(8 * noise, percentile(frames, 0.97)), soft: noise };
  }
  return { lo: 1.0 * noise, hi: Math.max(25 * noise, percentile(frames, 0.998)), soft: 2 * noise };
}

/** Largest background noise of a band across epochs. */
export function refNoise(noise: number[][], band: number) {
  return Math.max(...noise.map((n) => n[band]));
}

/** Log stretch strength: log(1 + A x) / log(1 + A). */
const LOG_A = 1000;

/** Brightness 0..1 for a value, under the chosen stretch. */
export function stretchUnit(v: number, s: Stretch): number {
  const x = v - s.lo;
  if (!(x > 0)) return 0;
  const span = s.hi - s.lo;
  if (s.fn === 'linear') return Math.min(1, x / span);
  if (s.fn === 'sqrt') return Math.sqrt(Math.min(1, x / span));
  if (s.fn === 'log') return Math.min(1, Math.log(1 + (LOG_A * x) / span) / Math.log(1 + LOG_A));
  const r = Math.asinh(x / s.soft) / Math.asinh(span / s.soft);
  return r > 1 ? 1 : r;
}

/** The value that gives brightness u (0..1): the inverse of stretchUnit, used to label the colour bar. */
export function stretchInverse(u: number, s: Stretch): number {
  const span = s.hi - s.lo;
  const t = Math.min(1, Math.max(0, u));
  if (s.fn === 'linear') return s.lo + t * span;
  if (s.fn === 'sqrt') return s.lo + t * t * span;
  if (s.fn === 'log') return s.lo + (span * (Math.pow(1 + LOG_A, t) - 1)) / LOG_A;
  return s.lo + s.soft * Math.sinh(t * Math.asinh(span / s.soft));
}

/**
 * Stretch from percentiles of the valid pixels (masked pixels are skipped), one stretch for all visits of a band.
 * `loPct` / `hiPct` are percentages (0-100). For asinh the knee is a twentieth of the range, never below `noise`.
 */
export function percentileStretch(
  frames: Float32Array[], masks: (Uint8Array | undefined)[], loPct: number, hiPct: number, fn: StretchFn, noise: number,
): Stretch {
  const sample: number[] = [];
  const total = frames.reduce((n, a) => n + a.length, 0);
  const step = Math.max(1, Math.floor(total / 60000));
  frames.forEach((a, k) => {
    const m = masks[k];
    for (let i = 0; i < a.length; i += step) if (!(m && m[i]) && Number.isFinite(a[i])) sample.push(a[i]);
  });
  if (!sample.length) return { lo: 0, hi: 1, soft: 0.1, fn };
  sample.sort((x, y) => x - y);
  const at = (p: number) => sample[Math.min(sample.length - 1, Math.max(0, Math.floor((p / 100) * sample.length)))];
  const lo = at(loPct);
  let hi = at(hiPct);
  if (!(hi > lo)) hi = lo + Math.max(noise, 1e-9);
  return { lo, hi, soft: Math.max(noise, (hi - lo) / 20), fn };
}

/** Colour of one grey-to-tint ramp step, v in 0..1. */
export function rampColor(v: number, tint: [number, number, number], invert: boolean): [number, number, number] {
  if (invert) return [244 - v * 228, 242 - v * 223, 255 - v * 192];
  if (v < 0.6) {
    const t = v / 0.6;
    return [BG[0] + (tint[0] - BG[0]) * t, BG[1] + (tint[1] - BG[1]) * t, BG[2] + (tint[2] - BG[2]) * t];
  }
  const t = (v - 0.6) / 0.4;
  return [tint[0] + (255 - tint[0]) * t, tint[1] + (255 - tint[1]) * t, tint[2] + (255 - tint[2]) * t];
}

/**
 * "No data" pixels are a visible hatched mid-grey, so a masked or missing pixel can never be mistaken for a
 * dark sky or a black hole. Two greys in diagonal stripes 2 pixels wide.
 */
export function noDataColor(x: number, y: number): [number, number, number] {
  return (x + y) % 4 < 2 ? [128, 132, 140] : [98, 102, 110];
}

const sideOf = (len: number) => Math.round(Math.sqrt(len));

function paintNoData(out: Uint8ClampedArray, nodata: Uint8Array, w: number) {
  for (let i = 0; i < nodata.length; i++) {
    if (!nodata[i]) continue;
    const c = noDataColor(i % w, (i / w) | 0);
    const o = i * 4;
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
  }
}

export function paintImage(
  img: ImageData, data: Float32Array, s: Stretch, tint: [number, number, number], invert: boolean, nodata?: Uint8Array,
) {
  const out = img.data;
  for (let i = 0; i < data.length; i++) {
    const [r, g, b] = rampColor(stretchUnit(data[i], s), tint, invert);
    const o = i * 4;
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
  }
  if (nodata) paintNoData(out, nodata, sideOf(data.length));
}

/** Signed difference: warm white where something is now, teal where it used to be. */
export function paintDiff(img: ImageData, diff: Float32Array, scale: number, nodata?: Uint8Array) {
  const out = img.data;
  for (let i = 0; i < diff.length; i++) {
    const v = Math.max(-1, Math.min(1, diff[i] / scale));
    const t = Math.abs(v);
    const target = v >= 0 ? [255, 238, 214] : [94, 234, 212];
    const o = i * 4;
    out[o] = BG[0] + (target[0] - BG[0]) * t;
    out[o + 1] = BG[1] + (target[1] - BG[1]) * t;
    out[o + 2] = BG[2] + (target[2] - BG[2]) * t;
    out[o + 3] = 255;
  }
  if (nodata) paintNoData(out, nodata, sideOf(diff.length));
}

/** Union of two no-data masks (a difference is unknown where either picture is). */
export function unionMask(a?: Uint8Array, b?: Uint8Array): Uint8Array | undefined {
  if (!a) return b;
  if (!b) return a;
  const out = new Uint8Array(a.length);
  for (let i = 0; i < out.length; i++) out[i] = a[i] | b[i];
  return out;
}

/**
 * Mean of the visits at each pixel, ignoring visits where the pixel has no data. A pixel that no visit covers is
 * "no data" in the result.
 */
export function maskedMean(frames: Float32Array[], masks: (Uint8Array | undefined)[]): { data: Float32Array; nodata: Uint8Array } {
  const n = frames[0].length;
  const data = new Float32Array(n);
  const nodata = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0, k = 0;
    for (let f = 0; f < frames.length; f++) {
      if (masks[f]?.[i]) continue;
      sum += frames[f][i];
      k++;
    }
    if (k) data[i] = sum / k;
    else nodata[i] = 1;
  }
  return { data, nodata };
}

export function subtract(a: Float32Array, b: Float32Array) {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] - b[i];
  return out;
}

export function mean(frames: Float32Array[]) {
  const out = new Float32Array(frames[0].length);
  for (const f of frames) for (let i = 0; i < f.length; i++) out[i] += f[i] / frames.length;
  return out;
}

/** Cut a square window out of an image (for the result screen close-ups). */
export function cropFrame(data: Float32Array, size: number, cx: number, cy: number, half: number) {
  const w = half * 2 + 1;
  const out = new Float32Array(w * w);
  const x0 = Math.round(cx) - half;
  const y0 = Math.round(cy) - half;
  for (let j = 0; j < w; j++) {
    for (let i = 0; i < w; i++) {
      const x = x0 + i, y = y0 + j;
      out[j * w + i] = x >= 0 && y >= 0 && x < size && y < size ? data[y * size + x] : 0;
    }
  }
  return { data: out, size: w, x0, y0 };
}
