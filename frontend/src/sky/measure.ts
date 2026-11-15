// "Measure it": find a marked source in every epoch and see how far it moved.
//
// Ported to TypeScript on SkyPatch arrays. Orientation: row 0 = north, column 0 = east, so a source with
// positive Dec proper motion moves toward SMALLER row numbers.

import type { Pt, SkyPatch } from '../data/types';
import { pixelToSky } from './astro';
import { num, t, tp } from '../i18n';

/** Image with unusable pixels (flagged or missing) set to NaN, so they are skipped instead of trusted. */
export function maskedImage(patch: SkyPatch, epoch: number, band: number): Float32Array {
  const src = patch.frames[epoch][band];
  const flg = patch.flags[epoch][band];
  const out = new Float32Array(src.length);
  for (let i = 0; i < out.length; i++) out[i] = flg[i] ? NaN : src[i];
  return out;
}

function medianOf(vals: number[]) {
  vals.sort((a, b) => a - b);
  return vals.length ? vals[vals.length >> 1] : 0;
}

export interface Located {
  x: number;
  y: number;
  flux: number;
  holes: number;
  snr: number;
  /** Rough 1-sigma position error in arcseconds. */
  err: number;
  /** True when the star's core is saturated or masked and the centre comes from its wings. */
  sat: boolean;
  /** Radius (pixels) of the saturated hole. */
  rh: number;
  /** Distance moved from the search start (only set when following a source). */
  d?: number;
}

function peaksNear(img: Float32Array, n: number, cx: number, cy: number, rs: number): [number, number, number][] {
  const box = (i: number, j: number) => {
    let t = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const v = img[(j + dj) * n + i + di];
        if (Number.isFinite(v)) t += v;
      }
    }
    return t;
  };
  const out: [number, number, number][] = [];
  for (let j = Math.max(2, Math.floor(cy - rs)); j <= Math.min(n - 3, Math.ceil(cy + rs)); j++) {
    for (let i = Math.max(2, Math.floor(cx - rs)); i <= Math.min(n - 3, Math.ceil(cx + rs)); i++) {
      if ((i - cx) ** 2 + (j - cy) ** 2 > rs * rs) continue;
      const t = box(i, j);
      let top = true;
      for (let dj = -1; dj <= 1 && top; dj++) {
        for (let di = -1; di <= 1; di++) {
          if ((di || dj) && box(i + di, j + dj) > t) { top = false; break; }
        }
      }
      if (top) out.push([i, j, t]);
    }
  }
  out.sort((p, q) => q[2] - p[2]);
  return out.length ? out.slice(0, 6) : [[Math.round(cx), Math.round(cy), 0]];
}

interface Centre { x: number; y: number; flux: number; holes: number; snr: number }

/** Brightness-weighted centre above the local sky (median of a ring just outside the window). */
function centroid(img: Float32Array, n: number, cx: number, cy: number, r: number, sig: number): Centre | null {
  const ring: number[] = [];
  const R = Math.ceil(r + 4);
  for (let j = Math.round(cy) - R; j <= Math.round(cy) + R; j++) {
    for (let i = Math.round(cx) - R; i <= Math.round(cx) + R; i++) {
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const d = Math.hypot(i - cx, j - cy);
      const v = img[j * n + i];
      if (d > r + 1 && d <= r + 4 && Number.isFinite(v)) ring.push(v);
    }
  }
  const bg = medianOf(ring);
  let x = cx, y = cy, flux = 0, np = 0, holes = 0;
  for (let it = 0; it < 3; it++) {
    let sw = 0, sx = 0, sy = 0;
    flux = 0; np = 0; holes = 0;
    for (let j = Math.floor(y - r); j <= Math.ceil(y + r); j++) {
      for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) {
        if (i < 0 || j < 0 || i >= n || j >= n || Math.hypot(i - x, j - y) > r) continue;
        const v = img[j * n + i];
        if (!Number.isFinite(v)) { holes++; continue; }
        const w = Math.max(0, v - bg);
        sw += w; sx += w * i; sy += w * j; flux += v - bg; np++;
      }
    }
    if (!sw || !np) return null;
    x = sx / sw; y = sy / sw;
  }
  return { x, y, flux, holes, snr: flux / (sig * Math.sqrt(np)) };
}

/** The empty (saturated or masked) region touching a window of radius r around (x, y), if it is a closed hole. */
function holeAt(img: Float32Array, n: number, x: number, y: number, r: number) {
  const seen = new Set<number>();
  const todo: number[] = [];
  for (let j = Math.max(0, Math.floor(y - r)); j <= Math.min(n - 1, Math.ceil(y + r)); j++) {
    for (let i = Math.max(0, Math.floor(x - r)); i <= Math.min(n - 1, Math.ceil(x + r)); i++) {
      if (Math.hypot(i - x, j - y) <= r && !Number.isFinite(img[j * n + i])) todo.push(j * n + i);
    }
  }
  let cnt = 0, hx = 0, hy = 0;
  while (todo.length) {
    const p = todo.pop()!;
    if (seen.has(p)) continue;
    seen.add(p);
    const i = p % n, j = (p - i) / n;
    if (i === 0 || j === 0 || i === n - 1 || j === n - 1 || ++cnt > 600) return null; // runs off the image: an edge, not a star
    hx += i; hy += j;
    for (const q of [p + 1, p - 1, p + n, p - n]) {
      if (q >= 0 && q < n * n && !Number.isFinite(img[q]) && !seen.has(q)) todo.push(q);
    }
  }
  return cnt ? { cnt, x: hx / cnt, y: hy / cnt } : null;
}

/**
 * Measure what sits at pixel (bx, by). A saturated star has an empty core: a small window then follows the rim of
 * the hole. Such a star is measured from the middle of the hole, with a window that takes in its wings, so its
 * number is only approximate.
 */
function sourceHere(img: Float32Array, n: number, ps: number, sig: number, bx: number, by: number): Located | null {
  const r = Math.max(2, 9 / ps);
  let c = centroid(img, n, bx, by, r, sig);
  const hole = !c || c.holes ? holeAt(img, n, c ? c.x : bx, c ? c.y : by, r) : null;
  let sat = false;
  let rh = 0;
  if (hole && hole.cnt >= 4) {
    rh = Math.sqrt(hole.cnt / Math.PI);
    const w = centroid(img, n, hole.x, hole.y, Math.max(15 / ps, 2.5 * rh + 2), sig);
    if (!w || Math.hypot(w.x - hole.x, w.y - hole.y) > rh + 2) return null;
    c = w;
    sat = true;
  } else if (!c || Math.hypot(c.x - bx, c.y - by) > 0.6 * r) {
    return null; // a slope (the wing of a bright star), not a source
  }
  if (c.snr < 5) return null;
  const err = sat ? Math.max(1.5, 0.2 * rh * ps) : Math.max(0.3, 6.2 / c.snr);
  return { ...c, err, sat, rh };
}

/**
 * Find a source within rs pixels of (x, y). Without `ref`: the brightest one. With `ref` (the same source in
 * another epoch): the nearest one of about the same brightness, so the search does not hop to a neighbour.
 */
export function locate(
  img: Float32Array, n: number, ps: number, sig: number, x: number, y: number, rs: number, ref?: Located,
): Located | null {
  let best: Located | null = null;
  for (const [bx, by] of peaksNear(img, n, x, y, rs)) {
    const c = sourceHere(img, n, ps, sig, bx, by);
    if (!c) continue;
    if (!ref) {
      if (!best || c.flux > best.flux) best = c;
      continue;
    }
    const q = c.flux / ref.flux;
    const lim = c.sat || ref.sat ? 3 : 2;
    if (q < 1 / lim || q > lim) continue;
    c.d = Math.hypot(c.x - x, c.y - y);
    if (!best || c.d < (best.d ?? Infinity)) best = c;
  }
  return best;
}

export interface MeasurePoint {
  epoch: number;
  x: number;
  y: number;
  ra: number;
  dec: number;
  snr: number;
  errArcsec: number;
  saturated: boolean;
  /** Offsets from the first measured epoch, arcseconds (east and north positive). */
  east: number;
  north: number;
}

export interface Measurement {
  status: 'ok' | 'faint' | 'nodata';
  band: number;
  anchor: number;
  points: MeasurePoint[];
  shiftArcsec: number;
  errArcsec: number;
  years: number;
  /** Arcseconds per year, or null if the epochs are too close in time. */
  rate: number | null;
  east: number;
  north: number;
  /** Clearly bigger than the error and steady from visit to visit. */
  moved: boolean;
  /** Bigger than the error but the positions jump about: probably a blend or a hop to a neighbour. */
  jumpy: boolean;
  weak: boolean;
  saturated: boolean;
  /** Epochs where the source could not be found again. */
  missing: number;
}

const EMPTY: Omit<Measurement, 'status' | 'band' | 'anchor'> = {
  points: [], shiftArcsec: 0, errArcsec: 0, years: 0, rate: null, east: 0, north: 0,
  moved: false, jumpy: false, weak: false, saturated: false, missing: 0,
};

/** Measure the marked source in one band, following it outwards from the epoch where it was marked. */
export function measureSource(patch: SkyPatch, band: number, mark: Pt, anchorEpoch = patch.epochs.length - 1): Measurement {
  const n = patch.size;
  const ps = patch.pixelScale;
  const have = patch.epochs.map((_, e) => e).filter((e) => !patch.missing?.[e]?.[band]);
  if (!have.length) return { ...EMPTY, status: 'nodata', band, anchor: anchorEpoch };
  const anchor = have.reduce((a, b) => (Math.abs(b - anchorEpoch) < Math.abs(a - anchorEpoch) ? b : a));
  const imgs = new Map<number, Float32Array>();
  const img = (e: number) => {
    let m = imgs.get(e);
    if (!m) { m = maskedImage(patch, e, band); imgs.set(e, m); }
    return m;
  };
  const at = (e: number, cx: number, cy: number, rs: number, ref?: Located) =>
    locate(img(e), n, ps, patch.noise[e][band], cx, cy, rs, ref);

  const a = at(anchor, mark.x, mark.y, Math.max(1.5, 7 / ps));
  if (!a) return { ...EMPTY, status: 'faint', band, anchor };
  const found = new Map<number, Located>([[anchor, a]]);
  for (const dir of [-1, 1]) {
    let prev = a;
    for (let k = have.indexOf(anchor) + dir; k >= 0 && k < have.length; k += dir) {
      const c = at(have[k], prev.x, prev.y, 14 / ps, a);
      if (c) { found.set(have[k], c); prev = c; }
    }
  }
  const ok = [...found.keys()].sort((p, q) => p - q);
  const first = found.get(ok[0])!;
  const points: MeasurePoint[] = ok.map((e) => {
    const p = found.get(e)!;
    const sky = pixelToSky(patch, p.x, p.y);
    return {
      epoch: e, x: p.x, y: p.y, ra: sky.ra, dec: sky.dec, snr: p.snr, errArcsec: p.err, saturated: p.sat,
      east: -(p.x - first.x) * ps, north: -(p.y - first.y) * ps,
    };
  });
  const lastP = points[points.length - 1];
  const firstP = points[0];
  const shift = Math.hypot(lastP.east, lastP.north);
  const err = Math.hypot(firstP.errArcsec, lastP.errArcsec);
  const years = (patch.epochs[lastP.epoch].mjd - patch.epochs[firstP.epoch].mjd) / 365.25;
  // A real mover drifts steadily. Positions that jump about are a blend or a hop to a neighbour.
  let steady = true;
  for (const p of points.slice(1, -1)) {
    const span = patch.epochs[lastP.epoch].mjd - patch.epochs[firstP.epoch].mjd || 1;
    const f = (patch.epochs[p.epoch].mjd - patch.epochs[firstP.epoch].mjd) / span;
    if (Math.hypot(p.east - f * lastP.east, p.north - f * lastP.north) > Math.max(3 * p.errArcsec, 3)) steady = false;
  }
  const big = points.length > 1 && shift > Math.max(3 * err, 1.5);
  return {
    status: 'ok', band, anchor, points, shiftArcsec: shift, errArcsec: err, years,
    rate: years > 0.05 ? shift / years : null, east: lastP.east, north: lastP.north,
    moved: big && steady, jumpy: big && !steady,
    weak: Math.min(...points.map((p) => p.snr)) < 20,
    saturated: points.some((p) => p.saturated),
    missing: have.length - ok.length,
  };
}

/** Try the longest wavelength first (stars are brightest and sharpest there), then the others. */
export function measureBest(patch: SkyPatch, mark: Pt, preferBand?: number): Measurement {
  const order = patch.bands
    .map((b, i) => ({ i, w: b.rangeUm[0] }))
    .sort((p, q) => q.w - p.w)
    .map((x) => x.i);
  if (preferBand !== undefined) {
    order.splice(order.indexOf(preferBand), 1);
    order.unshift(preferBand);
  }
  let last: Measurement | null = null;
  for (const b of order) {
    const m = measureSource(patch, b, mark);
    if (m.status === 'ok') return m;
    last = m;
  }
  return last!;
}

const fmt = (v: number) => num(v, v >= 10 ? 0 : 1);

/** Something familiar to compare an angle with. Jupiter is about 40 arcseconds wide from Earth; the Moon 1800. */
export function sizeComparison(arcsec: number): string {
  if (arcsec < 1) return t('msr.size.tiny');
  if (arcsec <= 60) {
    const f = arcsec / 40;
    if (f < 0.9) return t(f < 0.3 ? 'msr.size.quarter' : f < 0.6 ? 'msr.size.half' : 'msr.size.threeQuarters');
    if (f < 1.3) return t('msr.size.same');
    return t('msr.size.times', { f: fmt(f) });
  }
  const f = 1800 / arcsec;
  return f > 1.5 ? t('msr.size.moonFraction', { n: Math.round(f) }) : t('msr.size.moon');
}

export function describeMeasurement(m: Measurement): string {
  if (m.status === 'nodata') return t('msr.nodata');
  if (m.status === 'faint') return t('msr.faint');
  const approx = m.saturated ? ' ' + t('msr.approx') : '';
  const weak = m.weak ? ' ' + t('msr.weak') : '';
  if (m.points.length < 2) return t('msr.oneVisit') + approx;
  const sh = fmt(m.shiftArcsec);
  const yrs = m.years >= 1 ? t('msr.years', { v: fmt(m.years) }) : tp('msr.months', Math.round(m.years * 12), { v: Math.round(m.years * 12) });
  if (m.jumpy) return t('msr.jumpy', { sh }) + approx;
  if (!m.moved) return t('msr.still', { sh, yrs, err: fmt(m.errArcsec) }) + approx + weak;
  const rate = m.rate !== null ? ' ' + t('msr.rate', { rate: fmt(m.rate) }) : '';
  return t('msr.moved', { sh, yrs, rate, cmp: sizeComparison(m.shiftArcsec) }) + approx + weak;
}

const DIRECTIONS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Direction of an offset as an id, e.g. "north-east" ('' for no offset). */
export function directionWord(east: number, north: number): Direction | '' {
  if (Math.hypot(east, north) < 1e-9) return '';
  const k = Math.round(Math.atan2(east, north) / (Math.PI / 4) + 8) % 8;
  return DIRECTIONS[k];
}

/** The same direction in words, in the current language. */
export function directionText(east: number, north: number): string {
  const d = directionWord(east, north);
  return d ? t(`dir.${d}`) : '';
}
