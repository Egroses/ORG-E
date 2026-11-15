import type { PatchRequest, SkyPatch } from './types';
import { convertPatch, type PatchPayload } from './realProvider';
import { dayMonthYear, t } from '../i18n';

// Saved copies of the five practice targets (frontend/public/static, made by scripts/export-static.mjs).
// Used only when the live service cannot answer. Files are verbatim /api/patch and /api/gaia answers.

export interface StaticEntry {
  file: string;
  target: string;
  kind: 'game' | 'realistic' | 'gaia';
  group?: string | null;
  dets?: number[];
  gap_days?: number;
  max_span_days?: number;
  fov?: number;
  ra: number;
  dec: number;
}
export interface StaticIndex { generated_at: string; files: StaticEntry[] }

/** A request within this distance of a target uses that target's saved copy (same rule as the backend's cache snap). */
const SNAP_ARCSEC = 10;

const baseUrl = () => (import.meta.env?.BASE_URL as string | undefined) ?? '/';
const urlOf = (file: string) => `${baseUrl()}static/${file}`.replace(/\/{2,}static/, '/static');

let indexP: Promise<StaticIndex | null> | undefined;
/** Loads index.json once. Null when there are no saved copies (a dev server answers a missing file with index.html, which is not JSON). */
export function loadStaticIndex(): Promise<StaticIndex | null> {
  indexP ??= (async () => {
    try {
      const res = await fetch(urlOf('index.json'));
      if (!res.ok) return null;
      const j = (await res.json()) as StaticIndex;
      return Array.isArray(j?.files) ? j : null;
    } catch {
      return null;
    }
  })();
  return indexP;
}
/** For tests. */
export function resetStaticIndex() { indexP = undefined; }

/** Angular distance in arcseconds (small-field flat approximation is plenty at 10 arcsec). */
function sepArcsec(ra1: number, dec1: number, ra2: number, dec2: number) {
  const dra = ((ra1 - ra2 + 540) % 360) - 180;
  return Math.hypot(dra * Math.cos((dec1 * Math.PI) / 180), dec1 - dec2) * 3600;
}

const sameDets = (a: number[] | undefined, b: number[]) => !!a && [...a].sort().join() === [...b].sort().join();

/**
 * Picks the saved file of a request: position (within 10 arcsec), field of view, detector set and visit grouping.
 * A request without grouping (Explore in Game view) gets the Game copy of the target, whose grouping is the
 * practice-case one; it is the closest saved answer, not the same grouping the service would have used.
 */
export function matchStaticEntry(req: PatchRequest, index: StaticIndex): StaticEntry | null {
  const dets = req.dets ?? [2, 4, 6];
  const cands = index.files.filter((f) => f.kind !== 'gaia' && sepArcsec(req.ra, req.dec, f.ra, f.dec) <= SNAP_ARCSEC && Math.abs((f.fov ?? 0.1) - req.fovDeg) < 1e-6 && sameDets(f.dets, dets));
  if (req.gapDays == null || req.maxSpanDays == null) return cands.find((f) => f.kind === 'game') ?? null;
  return cands.find((f) => f.gap_days === req.gapDays && f.max_span_days === req.maxSpanDays) ?? null;
}

/** The saved SkyPatch for a request, or null when there is none (or it cannot be read). Never throws. */
export async function getStaticPatch(req: PatchRequest): Promise<SkyPatch | null> {
  try {
    const index = await loadStaticIndex();
    if (!index) return null;
    const entry = matchStaticEntry(req, index);
    if (!entry) return null;
    const res = await fetch(urlOf(entry.file));
    if (!res.ok) return null;
    const patch = convertPatch((await res.json()) as PatchPayload);
    if (entry.gap_days != null && entry.max_span_days != null) patch.grouping = { gapDays: entry.gap_days, maxSpanDays: entry.max_span_days };
    patch.savedCopy = { generatedAt: index.generated_at };
    return patch;
  } catch {
    return null;
  }
}

/** Raw rows of the saved Gaia list of the target at this position, or null. Never throws. */
export async function getStaticGaiaRows(ra: number, dec: number): Promise<unknown | null> {
  try {
    const index = await loadStaticIndex();
    const entry = index?.files.find((f) => f.kind === 'gaia' && sepArcsec(ra, dec, f.ra, f.dec) <= SNAP_ARCSEC);
    if (!entry) return null;
    const res = await fetch(urlOf(entry.file));
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** "Showing a saved copy from 15 Nov 2026 (live service unavailable)", or null when the patch is not a saved copy. */
export function savedCopyText(patch: Pick<SkyPatch, 'savedCopy'>): string | null {
  if (!patch.savedCopy) return null;
  const ms = Date.parse(patch.savedCopy.generatedAt);
  const date = Number.isFinite(ms) ? dayMonthYear(ms / 86400000 + 40587) : patch.savedCopy.generatedAt;
  return t('saved.copy', { date });
}
