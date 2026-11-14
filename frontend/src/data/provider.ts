import type { PatchRequest, SkyDataProvider, SkyPatch, TargetId } from './types';
import { mockProvider } from './mockProvider';
import { EPOCHS, KNOWN } from './catalog';
import { mjdToYear, propagate } from '../sky/astro';

// Swap point for real data: implement SkyDataProvider against the backend and return it here.
export const provider: SkyDataProvider = mockProvider;

const cache = new Map<string, Promise<SkyPatch>>();
const keyOf = (r: PatchRequest) => `${r.ra.toFixed(5)},${r.dec.toFixed(5)},${r.fovDeg}`;

export function loadPatch(req: PatchRequest, onStep?: Parameters<SkyDataProvider['getPatch']>[1]) {
  const key = keyOf(req);
  const hit = cache.get(key);
  if (hit) return hit;
  const p = provider.getPatch(req, onStep);
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

/** Practice targets are centred where the object is at the middle epoch, not at its catalogue epoch. */
export function caseRequest(id: TargetId, fovDeg = 0.1): PatchRequest {
  const pos = propagate(KNOWN[id], mjdToYear(EPOCHS[1].mjd));
  return { ra: pos.ra, dec: pos.dec, fovDeg, cached: true };
}
