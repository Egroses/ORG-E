import type { Detail } from '../data/types';

export interface Stretch { lo: number; hi: number; soft: number }

const BG: [number, number, number] = [11, 10, 36];

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

const unit = (v: number, s: Stretch) => {
  const x = v - s.lo;
  if (x <= 0) return 0;
  const r = Math.asinh(x / s.soft) / Math.asinh((s.hi - s.lo) / s.soft);
  return r > 1 ? 1 : r;
};

export function paintImage(
  img: ImageData, data: Float32Array, s: Stretch, tint: [number, number, number], invert: boolean,
) {
  const out = img.data;
  for (let i = 0; i < data.length; i++) {
    const v = unit(data[i], s);
    let r: number, g: number, b: number;
    if (invert) {
      r = 244 - v * 228; g = 242 - v * 223; b = 255 - v * 192;
    } else if (v < 0.6) {
      const t = v / 0.6;
      r = BG[0] + (tint[0] - BG[0]) * t; g = BG[1] + (tint[1] - BG[1]) * t; b = BG[2] + (tint[2] - BG[2]) * t;
    } else {
      const t = (v - 0.6) / 0.4;
      r = tint[0] + (255 - tint[0]) * t; g = tint[1] + (255 - tint[1]) * t; b = tint[2] + (255 - tint[2]) * t;
    }
    const o = i * 4;
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
  }
}

/** Signed difference: warm white where something is now, teal where it used to be. */
export function paintDiff(img: ImageData, diff: Float32Array, scale: number) {
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
