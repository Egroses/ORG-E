import type { PatchRequest, SkyDataProvider, SkyPatch, TargetId } from './types';
import { mockProvider } from './mockProvider';
import { GROUPINGS, type GroupId } from './catalog';
import { apiIsUp, createRealProvider } from './realProvider';
import { DataError } from './errors';

export type DataMode = 'real' | 'mock';

/**
 * Chooses the data source once, at startup:
 *  - `?data=mock` in the address forces the demo data;
 *  - otherwise GET {VITE_API_BASE}/api/health decides: it answers -> real data, it does not -> demo data.
 */
function forcedMock() {
  try {
    return new URLSearchParams(window.location.search).get('data') === 'mock';
  } catch {
    return false;
  }
}

let mode: DataMode = 'mock';
const real = createRealProvider();

export const dataModeReady: Promise<DataMode> = (forcedMock() ? Promise.resolve(false) : apiIsUp()).then((up) => {
  mode = up ? 'real' : 'mock';
  return mode;
});

export const getDataMode = () => mode;
export const isMockForced = forcedMock;

export const provider: SkyDataProvider = {
  async getPatch(req, onStep) {
    await dataModeReady;
    if (mode === 'mock') {
      // Realistic mode shows demo data only when it was asked for with ?data=mock, never because the service is down.
      if (req.strict && !forcedMock()) throw new DataError('noService');
      return mockProvider.getPatch(req, onStep);
    }
    try {
      return await real.getPatch(req, onStep);
    } catch (e) {
      // The five practice cases must always open: fall back to demo data (the "Demo data" chip then shows).
      if (req.cached && !req.strict) return mockProvider.getPatch(req, onStep);
      throw e;
    }
  },
};

const cache = new Map<string, Promise<SkyPatch>>();
/** One key for everything that changes the answer: position, field, visit grouping, detectors. */
export const patchKey = (r: PatchRequest) =>
  `${r.ra.toFixed(6)},${r.dec.toFixed(6)},${r.fovDeg},${r.gapDays ?? ''},${r.maxSpanDays ?? ''},${(r.dets ?? [2, 4, 6]).join('')},${r.strict ? 's' : ''}`;
const keyOf = patchKey;

export function loadPatch(req: PatchRequest, onStep?: Parameters<SkyDataProvider['getPatch']>[1]) {
  const key = keyOf(req);
  const hit = cache.get(key);
  if (hit) return hit;
  const p = provider.getPatch(req, onStep);
  cache.set(key, p);
  p.catch(() => cache.delete(key));
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
