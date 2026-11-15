// "Changes in this field": sources that moved, brightened or faded between the first and the last photo.
//

import type { SkyPatch } from '../data/types';
import { locate, maskedImage } from './measure';
import { pixelToSky } from './astro';
import { num, t } from '../i18n';
import { directionWord, type Direction } from './measure';

export interface FieldChange {
  kind: 'Moved' | 'Brightened' | 'Faded' | 'Appeared' | 'Gone';
  /** Size of the change as data; `changeAmountText` words it in the current language. */
  amount: ChangeAmount;
  x: number;
  y: number;
  ra: number;
  dec: number;
  where: ChangeWhere;
  rank: number;
}

export type ChangeAmount =
  | { kind: 'arcsec'; value: number }
  | { kind: 'percent'; value: number; up: boolean }
  | { kind: 'saturated' }
  | { kind: 'unknown' };

export type ChangeWhere = { kind: 'centre' } | { kind: 'offset'; arcsec: number; dir: Direction };

const fmtArcsec = (v: number) => num(v, v >= 10 ? 0 : 1);

/** "12 arcseconds", "+80%", ... in the current language ('' when nothing can be said). */
export function changeAmountText(a: ChangeAmount): string {
  switch (a.kind) {
    case 'arcsec': return t('chg.arcsec', { v: fmtArcsec(a.value) });
    case 'percent': return `${a.up ? '+' : '−'}${a.value}%`;
    case 'saturated': return t('chg.saturated');
    case 'unknown': return '';
  }
}

export function changeWhereText(w: ChangeWhere): string {
  return w.kind === 'centre' ? t('chg.centre') : t('chg.offset', { v: fmtArcsec(w.arcsec), dir: t(`dir.${w.dir}`) });
}

export interface ChangesResult {
  single: boolean;
  first: number;
  last: number;
  rows: FieldChange[];
}

const medianOf = (v: number[]) => {
  v.sort((a, b) => a - b);
  return v.length ? v[v.length >> 1] : 0;
};

function robustSigma(d: Float32Array) {
  const vals: number[] = [];
  for (let i = 0; i < d.length; i += 3) if (Number.isFinite(d[i])) vals.push(d[i]);
  const med = medianOf([...vals]);
  const mad = medianOf(vals.map((v) => Math.abs(v - med)));
  return Math.max(1.4826 * mad, 1e-6);
}

export function findChanges(patch: SkyPatch, band: number, maxRows = 5): ChangesResult {
  const have = patch.epochs.map((_, e) => e).filter((e) => !patch.missing?.[e]?.[band]);
  const a = have[0];
  const b = have[have.length - 1];
  if (have.length < 2) return { single: true, first: a ?? 0, last: b ?? 0, rows: [] };
  const n = patch.size;
  const ps = patch.pixelScale;
  const A = maskedImage(patch, a, band);
  const B = maskedImage(patch, b, band);
  const d = new Float32Array(A.length);
  for (let p = 0; p < d.length; p++) d[p] = B[p] - A[p];
  const sig = robustSigma(d);
  const mar = Math.ceil(9 / ps) + 1;
  const cand: { i: number; j: number; v: number }[] = [];
  for (let j = mar; j < n - mar; j++) {
    for (let i = mar; i < n - mar; i++) {
      const p = j * n + i;
      const v = d[p];
      const av = Math.abs(v);
      if (!(av > 8 * sig) || av < 0.15 * Math.max(Math.abs(A[p]), Math.abs(B[p]))) continue; // real, and not the rim of a bright star
      let top = true;
      for (let dj = -1; dj <= 1 && top; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (Math.abs(d[p + dj * n + di]) > av) { top = false; break; }
        }
      }
      if (top) cand.push({ i, j, v });
    }
  }
  cand.sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
  const keep: typeof cand = [];
  for (const c of cand) {
    if (keep.every((k) => Math.hypot(k.i - c.i, k.j - c.j) > 12 / ps)) keep.push(c);
    if (keep.length >= 14) break;
  }
  const sample = (img: Float32Array) => medianOf(Array.from(img).filter((v, k) => k % 7 === 0 && Number.isFinite(v)));
  const bgA = sample(A);
  const bgB = sample(B);
  const sum = (img: Float32Array, bg: number, c: { i: number; j: number }) => {
    let s = 0;
    const r = 9 / ps;
    for (let j = Math.floor(c.j - r); j <= c.j + r; j++) {
      for (let i = Math.floor(c.i - r); i <= c.i + r; i++) {
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const v = img[j * n + i];
        if (Math.hypot(i - c.i, j - c.j) <= r && Number.isFinite(v)) s += v - bg;
      }
    }
    return s;
  };
  const sA = patch.noise[a][band];
  const sB = patch.noise[b][band];
  const apSig = 4 * sig * Math.sqrt(Math.PI) * 9 / ps;
  const where = (x: number, y: number) => {
    const e = -(x - (n - 1) / 2) * ps;
    const nn = -(y - (n - 1) / 2) * ps;
    const dist = Math.hypot(e, nn);
    if (dist < 6) return { kind: 'centre' } as ChangeWhere;
    return { kind: 'offset', arcsec: dist, dir: directionWord(e, nn) as Direction } as ChangeWhere;
  };
  const rows: Omit<FieldChange, 'where' | 'ra' | 'dec'>[] = [];
  const used = new Set<number>();
  keep.forEach((c, k) => {
    if (used.has(k)) return;
    const up = c.v > 0;
    const here = locate(up ? B : A, n, ps, up ? sB : sA, c.i, c.j, 6 / ps);
    const there = here ? locate(up ? A : B, n, ps, up ? sA : sB, here.x, here.y, 60 / ps, here) : null;
    const dist = here && there ? Math.hypot(here.x - there.x, here.y - there.y) * ps : 0;
    if (here && there && dist > Math.max(1.5, 3 * Math.hypot(here.err, there.err))) {
      const now = up ? here : there; // where it is in the last photo
      keep.forEach((o, m) => {
        if ([here, there].some((q) => Math.hypot(o.i - q.x, o.j - q.y) < (q.sat ? 30 : 12) / ps)) used.add(m);
      });
      rows.push({ kind: 'Moved', amount: { kind: 'arcsec', value: dist }, x: now.x, y: now.y, rank: Math.abs(c.v) * 2 });
      return;
    }
    used.add(k);
    if (here?.sat) {
      keep.forEach((o, m) => {
        if (Math.hypot(o.i - here.x, o.j - here.y) < 2.5 * here.rh + 2 + 12 / ps) used.add(m);
      });
      rows.push({ kind: up ? 'Brightened' : 'Faded', amount: { kind: 'saturated' }, x: here.x, y: here.y, rank: Math.abs(c.v) });
      return;
    }
    const fa = sum(A, bgA, c);
    const fb = sum(B, bgB, c);
    const base = up ? fa : fb;
    const pct = base > apSig ? Math.abs(((fb - fa) / fa) * 100) : null;
    if (pct !== null && pct < 10) return; // a few per cent on a bright star is how the pixels fell, not a change
    const amount: ChangeAmount = pct !== null ? { kind: 'percent', value: Math.round(Math.min(999, pct)), up } : { kind: 'unknown' };
    rows.push({
      kind: up ? (pct !== null ? 'Brightened' : 'Appeared') : pct !== null ? 'Faded' : 'Gone',
      amount, x: c.i, y: c.j, rank: Math.abs(c.v),
    });
  });
  rows.sort((x, y) => y.rank - x.rank);
  return {
    single: false, first: a, last: b,
    rows: rows.slice(0, maxRows).map((r) => ({ ...r, where: where(r.x, r.y), ...pixelToSky(patch, r.x, r.y) })),
  };
}
