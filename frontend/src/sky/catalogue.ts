// Catalogue check: where should known stars be in each photo, and does the marked dot match one?
//

import type { KnownObject, SkyPatch } from '../data/types';
import { KNOWN } from '../data/catalog';
import { mjdToYear, propagate, skyToPixel } from './astro';
import type { Measurement } from './measure';
import { num, t } from '../i18n';

const DEG = Math.PI / 180;
/** The backend moves Gaia positions to this epoch (backend/app/config.py CENTER_EPOCH). */
export const CATALOGUE_EPOCH = 2026.0;

export interface CatalogueSource {
  id: string;
  name: string;
  /** Position at CATALOGUE_EPOCH, degrees. */
  ra: number;
  dec: number;
  /** Proper motion in mas/yr; pmRa already includes cos(dec) (Gaia convention). */
  pmRa: number;
  pmDec: number;
  gmag: number | null;
  origin: 'gaia' | 'known';
}

/** Where the source is at a given year. */
export function sourceAt(s: CatalogueSource, year: number): { ra: number; dec: number } {
  const dt = year - CATALOGUE_EPOCH;
  const dec = s.dec + (s.pmDec * dt) / 3.6e6;
  const ra = s.ra + (s.pmRa * dt) / 3.6e6 / Math.max(Math.cos(s.dec * DEG), 1e-6);
  return { ra: ((ra % 360) + 360) % 360, dec };
}

/** Pixel position of the source in every epoch (marks that follow the star from visit to visit). */
export function sourcePixels(patch: SkyPatch, s: CatalogueSource) {
  return patch.epochs.map((ep) => {
    const p = sourceAt(s, mjdToYear(ep.mjd));
    return skyToPixel(patch, p.ra, p.dec);
  });
}

export const motionArcsecPerYear = (s: CatalogueSource) => Math.hypot(s.pmRa, s.pmDec) / 1000;

/** The five practice targets, moved to the catalogue epoch. Used as a fallback when Gaia cannot be reached. */
export function knownAsCatalogue(): CatalogueSource[] {
  return Object.values(KNOWN).map((o: KnownObject) => {
    const p = propagate(o, CATALOGUE_EPOCH);
    return { id: o.id, name: o.name, ra: p.ra, dec: p.dec, pmRa: o.pmRa, pmDec: o.pmDec, gmag: null, origin: 'known' as const };
  });
}

/** Keep only sources that are inside the image in at least one epoch (with a small margin). */
export function inField(patch: SkyPatch, sources: CatalogueSource[], margin = 2) {
  return sources.filter((s) =>
    sourcePixels(patch, s).some((p) => p.x >= -margin && p.y >= -margin && p.x < patch.size + margin && p.y < patch.size + margin));
}

export type VerdictKind = 'match' | 'mismatch' | 'none' | 'unmeasured';

export interface Verdict {
  kind: VerdictKind;
  source: CatalogueSource | null;
  /** Distance between the catalogue mark and the measured dot, arcseconds. */
  offsetArcsec: number | null;
  catRate: number | null;
  /** The motion the catalogue gives, as data: `verdictText` words it in the current language. */
  moves: 'rate' | 'still' | null;
  /** True when the player may want to keep this spot as a candidate. */
  candidate: boolean;
}

const fmt = (v: number) => (v >= 10 ? num(v, 0) : v >= 1 ? num(v, 1) : num(v, 2));
export type SourceRef = Pick<CatalogueSource, 'name' | 'origin' | 'gmag'>;
const sourceLabel = (s: SourceRef) =>
  s.origin === 'gaia' ? t(s.gmag != null ? 'cat.gaiaStarG' : 'cat.gaiaStar', { name: s.name, g: s.gmag != null ? num(s.gmag, 1) : '' }) : s.name;

/** The verdict sentence in the current language. */
export function verdictText(v: { kind: VerdictKind; source: SourceRef | null; catRate: number | null; moves: 'rate' | 'still' | null }): string {
  if (v.kind === 'unmeasured') return t('verdict.unmeasured');
  if (v.kind === 'none' || !v.source) return t('verdict.none');
  const moves = v.moves === 'rate' && v.catRate !== null ? t('verdict.moves', { rate: fmt(v.catRate) }) : t('verdict.still');
  return t(v.kind === 'match' ? 'verdict.match' : 'verdict.mismatch', { name: sourceLabel(v.source), moves });
}

/**
 * Compare the measured dot with the catalogue. The dot is matched to the nearest catalogue mark (moved to the date
 * of the photo) within a few arcseconds. Then the catalogue motion over the measured time span is compared with the
 * measured shift: they agree when the difference is within twice the measuring error (at least 2 arcseconds).
 */
export function checkCatalogue(patch: SkyPatch, m: Measurement, sources: CatalogueSource[]): Verdict {
  if (m.status !== 'ok' || !m.points.length) {
    return { kind: 'unmeasured', source: null, offsetArcsec: null, catRate: null, candidate: false, moves: null };
  }
  const ref = m.points[m.points.length - 1];
  const year = mjdToYear(patch.epochs[ref.epoch].mjd);
  const reach = Math.max(6, 2 * ref.errArcsec + 3);
  let best: { s: CatalogueSource; d: number } | null = null;
  for (const s of sources) {
    const p = sourceAt(s, year);
    const dEast = (p.ra - ref.ra) * Math.cos(ref.dec * DEG) * 3600;
    const dNorth = (p.dec - ref.dec) * 3600;
    const d = Math.hypot(dEast, dNorth);
    if (d <= reach && (!best || d < best.d)) best = { s, d };
  }
  if (!best) {
    return { kind: 'none', source: null, offsetArcsec: null, catRate: null, candidate: true, moves: null };
  }
  const s = best.s;
  const rate = motionArcsecPerYear(s);
  // Predicted shift between the first and last measured photo, in arcseconds (east, north).
  const y0 = mjdToYear(patch.epochs[m.points[0].epoch].mjd);
  const y1 = mjdToYear(patch.epochs[ref.epoch].mjd);
  const pe = (s.pmRa * (y1 - y0)) / 1000;
  const pn = (s.pmDec * (y1 - y0)) / 1000;
  const diff = Math.hypot(pe - m.east, pn - m.north);
  const agree = diff <= Math.max(2, 2 * m.errArcsec);
  const moves = rate >= 0.05 ? 'rate' : 'still';
  if (agree) return { kind: 'match', source: s, offsetArcsec: best.d, catRate: rate, candidate: false, moves };
  return { kind: 'mismatch', source: s, offsetArcsec: best.d, catRate: rate, candidate: true, moves };
}
