import { useEffect, useMemo, useState } from 'react';
import type { SkyPatch } from './types';
import { fetchGaia } from './gaiaApi';
import { fetchCatwise } from './catwiseApi';
import { inField, knownAsCatalogue, type CatalogueSource } from '../sky/catalogue';

export interface WiseState {
  status: 'idle' | 'loading' | 'ok' | 'archive' | 'unreachable';
  /** CatWISE2020 sources inside the field (every entry, near-duplicates included). */
  sources: CatalogueSource[];
}

export interface CatalogueState {
  status: 'idle' | 'loading' | 'ok' | 'unavailable';
  /** Gaia sources (when reachable) plus the five practice objects that fall inside the field. */
  sources: CatalogueSource[];
  /** CatWISE2020, only loaded when `withWise` is asked for. Independent of Gaia: one can fail without the other. */
  wise: WiseState;
}

const NO_WISE: WiseState = { status: 'idle', sources: [] };

/** Loads Gaia sources around the patch once (and CatWISE when asked). When the service is not reachable, only the built-in objects are used. */
export function useCatalogue(patch: SkyPatch, enabled: boolean, withWise = false): CatalogueState {
  const [state, setState] = useState<{ status: CatalogueState['status']; sources: CatalogueSource[] }>({ status: 'idle', sources: [] });
  const radius = (patch.fovDeg / 2) * 1.5;
  const [wiseRes, setWiseRes] = useState<{ key: string; r: Awaited<ReturnType<typeof fetchCatwise>> } | null>(null);
  const wiseKey = `${patch.center.ra},${patch.center.dec},${radius}`;
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetchGaia(patch.center.ra, patch.center.dec, radius).then((gaia) => {
      if (!live) return;
      const known = inField(patch, knownAsCatalogue());
      setState(gaia ? { status: 'ok', sources: [...known, ...inField(patch, gaia)] } : { status: 'unavailable', sources: known });
    });
    return () => {
      live = false;
    };
  }, [patch, enabled, radius]);
  useEffect(() => {
    if (!enabled || !withWise) return;
    let live = true;
    fetchCatwise(patch.center.ra, patch.center.dec, radius).then((r) => {
      if (live) setWiseRes({ key: wiseKey, r });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wiseKey, enabled, withWise]);
  const wise = useMemo<WiseState>(() => {
    if (!withWise) return NO_WISE;
    if (wiseRes?.key !== wiseKey) return { status: 'loading', sources: [] };
    return wiseRes.r.ok ? { status: 'ok', sources: inField(patch, wiseRes.r.sources) } : { status: wiseRes.r.reason, sources: [] };
  }, [withWise, wiseRes, wiseKey, patch]);
  if (!enabled) return { status: 'idle', sources: [], wise: NO_WISE };
  return { ...state, wise };
}
