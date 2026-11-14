import { useEffect, useState } from 'react';
import type { SkyPatch } from './types';
import { fetchGaia } from './gaiaApi';
import { inField, knownAsCatalogue, type CatalogueSource } from '../sky/catalogue';

export interface CatalogueState {
  status: 'idle' | 'loading' | 'ok' | 'unavailable';
  /** Gaia sources (when reachable) plus the five practice objects that fall inside the field. */
  sources: CatalogueSource[];
}

/** Loads Gaia sources around the patch once. When the service is not reachable, only the built-in objects are used. */
export function useCatalogue(patch: SkyPatch, enabled: boolean): CatalogueState {
  const [state, setState] = useState<CatalogueState>({ status: 'idle', sources: [] });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetchGaia(patch.center.ra, patch.center.dec, (patch.fovDeg / 2) * 1.5).then((gaia) => {
      if (!live) return;
      const known = inField(patch, knownAsCatalogue());
      setState(gaia ? { status: 'ok', sources: [...known, ...inField(patch, gaia)] } : { status: 'unavailable', sources: known });
    });
    return () => {
      live = false;
    };
  }, [patch, enabled]);
  return enabled ? state : { status: 'idle', sources: [] };
}
