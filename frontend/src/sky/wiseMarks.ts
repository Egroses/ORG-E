// Marks for the CatWISE (WISE) layer: a square at the position in the shown visit and an arrow for the motion over 10 years.

import type { SkyPatch } from '../data/types';
import type { Arrow, Ring } from '../components/SkyCanvas';
import { mjdToYear, skyToPixel } from './astro';
import { pmUnreliable, sourceAt, type CatalogueSource } from './catalogue';
import { num } from '../i18n';

export const WISE_COLOR = '#b5e55c';
export const ARROW_YEARS = 10;
/** Motion below this (mas/yr) is too small to draw an arrow for. */
const MIN_ARROW_PM = 30;

/** Fast movers with a significant motion first (these are the ones worth looking at), then by W2 brightness. */
export const isFastMover = (s: CatalogueSource) => Math.hypot(s.pmRa, s.pmDec) >= FAST_PM && !pmUnreliable(s);
const FAST_PM = 1000;
export const wiseOrder = (a: CatalogueSource, b: CatalogueSource) =>
  Number(isFastMover(b)) - Number(isFastMover(a)) || (a.w2 ?? 99) - (b.w2 ?? 99);

export interface WiseMarks {
  rings: Ring[];
  arrows: Arrow[];
  /** Every WISE source that is inside the field, brightest (W2) first, whether or not it got a mark. */
  inView: CatalogueSource[];
}

export function wiseMarks(patch: SkyPatch, epoch: number, sources: CatalogueSource[], maxMarks = 20): WiseMarks {
  const year = mjdToYear(patch.epochs[epoch].mjd);
  const list = [...sources].filter((s) => s.origin === 'wise').sort(wiseOrder);
  const rings: Ring[] = [];
  const arrows: Arrow[] = [];
  const inView: CatalogueSource[] = [];
  for (const s of list) {
    const now = sourceAt(s, year);
    const p = skyToPixel(patch, now.ra, now.dec);
    if (!(p.x >= 0 && p.y >= 0 && p.x < patch.size && p.y < patch.size)) continue;
    inView.push(s);
    if (rings.length >= maxMarks) continue;
    rings.push({ x: p.x, y: p.y, color: WISE_COLOR, r: 2.6 * (6.15 / patch.pixelScale) / 2 + 1, square: true, label: s.w2 != null ? `W2 ${num(s.w2, 1)}` : undefined });
    if (Math.hypot(s.pmRa, s.pmDec) >= MIN_ARROW_PM && !pmUnreliable(s)) {
      const later = sourceAt(s, year + ARROW_YEARS);
      const q = skyToPixel(patch, later.ra, later.dec);
      arrows.push({ x: p.x, y: p.y, dx: q.x - p.x, dy: q.y - p.y, color: WISE_COLOR });
    }
  }
  return { rings, arrows, inView };
}
