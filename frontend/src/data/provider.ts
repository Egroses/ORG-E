import type { LoadOptions, PatchRequest, SkyDataProvider, SkyPatch, TargetId } from './types';
import { mockProvider } from './mockProvider';
import { GROUPINGS, type GroupId } from './catalog';
import { createRealProvider, isAbort } from './realProvider';
import { DataError } from './errors';
import { getStaticPatch } from './staticProvider';

export type DataMode = 'real' | 'mock';

/**
 * Where patch data comes from, in this order, with no exception:
 *   1. the live backend (GET /api/patch);
 *   2. the saved real copy shipped with the app (public/static, see staticProvider.ts);
 *   3. an honest error (DataError 'noService' when the service is unreachable, or the service's own error).
 * Demo data is NEVER a fallback. The only way to get it is the developer switch `?data=mock` in the address,
 * and while it is on the app shows a full-width banner (see DemoBanner).
 */
function forcedMock() {
  try {
    return new URLSearchParams(window.location.search).get('data') === 'mock';
  } catch {
    return false;
  }
}

const real = createRealProvider();

export const isMockForced = forcedMock;
/** 'mock' only while the developer switch is on. */
export const getDataMode = (): DataMode => (forcedMock() ? 'mock' : 'real');

export const provider: SkyDataProvider = {
  async getPatch(req, onStep, opts) {
    if (forcedMock()) return mockProvider.getPatch(req, onStep);
    try {
      return await real.getPatch(req, onStep, opts);
    } catch (e) {
      if (isAbort(e)) throw e;
      // Live answer failed (network, 5xx, "failed"): the saved real copy of the target, if there is one.
      const saved = await getStaticPatch(req);
      if (saved) { onStep?.('done'); return saved; }
      // No saved copy for this view: say so. A service that answered with its own error keeps that error.
      if (e instanceof DataError && e.kind !== 'unreachable') throw e;
      throw new DataError('noService');
    }
  },
};

const cache = new Map<string, Promise<SkyPatch>>();
/** One key for everything that changes the answer: position, field, visit grouping, detectors. */
export const patchKey = (r: PatchRequest) =>
  `${r.ra.toFixed(6)},${r.dec.toFixed(6)},${r.fovDeg},${r.gapDays ?? ''},${r.maxSpanDays ?? ''},${(r.dets ?? [2, 4, 6]).join('')},${r.strict ? 's' : ''}`;
const keyOf = patchKey;

const live = new Map<string, AbortSignal | undefined>();

export function loadPatch(req: PatchRequest, onStep?: Parameters<SkyDataProvider['getPatch']>[1], opts?: LoadOptions) {
  const key = keyOf(req);
  const hit = cache.get(key);
  // A load that was stopped (the visitor left the screen) is not reused.
  if (hit && !live.get(key)?.aborted) return hit;
  const p = provider.getPatch(req, onStep, opts);
  cache.set(key, p);
  live.set(key, opts?.signal);
  const forget = (drop: boolean) => { if (cache.get(key) !== p) return; live.delete(key); if (drop) cache.delete(key); };
  p.then(() => forget(false), () => forget(true));
  return p;
}

/** Positions of the five practice targets at epoch 2026.0, copied from pipeline/targets.json.
 *  They must stay identical to that file: the backend recognises a cached target by its coordinates, and a field
 *  centred even one arcsecond away would not be found in the cache. Fast movers (Barnard's Star, WISE 0855,
 *  Epsilon Indi B) are centred where they are in the middle of the observations, not at their catalogue epoch. */
const CASE_CENTRES: Record<TargetId, { ra: number; dec: number }> = {
  barnard: { ra: 269.446271, dec: 4.768197 },
  epsindb: { ra: 331.096658, dec: -56.800657 },
  wise0855: { ra: 133.759871, dec: -7.242252 },
  rwaur: { ra: 76.95659, dec: 30.401293 },
  rdra: { ra: 248.167233, dec: 66.755024 },
};

/** How many days of exposures make one "photo". 30 / 60 gives the three visits of Barnard's Star, WISE 0855 and
 *  RW Aurigae, each with all three bands. R Draconis (near the ecliptic pole) is observed in a different band every
 *  few weeks, so its photos span about five months to have all three bands in each. */
const CASE_EPOCHS: Partial<Record<TargetId, { gapDays: number; maxSpanDays: number }>> = {
  rdra: { gapDays: 60, maxSpanDays: 150 },
};
const DEFAULT_EPOCHS = { gapDays: 30, maxSpanDays: 60 };

export function caseRequest(id: TargetId, fovDeg = 0.1): PatchRequest {
  const centre = CASE_CENTRES[id];
  return { ra: centre.ra, dec: centre.dec, fovDeg, cached: true, ...(CASE_EPOCHS[id] ?? DEFAULT_EPOCHS) };
}

/** Realistic mode: all six detectors, grouping chosen by the visitor, never a demo fallback. */
export function realisticRequest(ra: number, dec: number, fovDeg: number, group: GroupId): PatchRequest {
  const g = GROUPINGS.find((x) => x.id === group) ?? GROUPINGS[1];
  return { ra, dec, fovDeg, dets: [1, 2, 3, 4, 5, 6], gapDays: g.gapDays, maxSpanDays: g.maxSpanDays, strict: true };
}
