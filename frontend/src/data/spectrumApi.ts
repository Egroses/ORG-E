import { useEffect, useState } from 'react';
import { API_BASE } from './realProvider';
import { adaptSpectrum, type SpectrumPoint } from '../sky/charts';

// GET /api/spectrum?ra=&dec= -> [{wavelength_um, flux_mjy, err_mjy, mjd, detector, flagged}].
// The real backend has it, the imaging dev server does not (404). Built against a fake response only: it has never
// been tried against the real backend.

/** null when the service does not offer it (404, no network); an empty array when it answers with no points. */
export async function fetchSpectrum(ra: number, dec: number, base = API_BASE, fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<SpectrumPoint[] | null> {
  try {
    const res = await fetchImpl(`${base}/api/spectrum?ra=${ra}&dec=${dec}`);
    if (!res.ok) return null;
    return adaptSpectrum(await res.json());
  } catch {
    return null;
  }
}

export interface SpectrumState {
  status: 'idle' | 'loading' | 'ok' | 'empty' | 'unavailable';
  points: SpectrumPoint[];
}

/** Loads the spectrum at a position (when there is one). */
export function useSpectrum(at: { ra: number; dec: number } | null, enabled: boolean): SpectrumState {
  const [state, setState] = useState<{ key: string; s: SpectrumState }>({ key: '', s: { status: 'idle', points: [] } });
  const key = at && enabled ? `${at.ra.toFixed(5)},${at.dec.toFixed(5)}` : '';
  useEffect(() => {
    if (!key || !at) return;
    let live = true;
    fetchSpectrum(at.ra, at.dec).then((pts) => {
      if (!live) return;
      setState({ key, s: pts === null ? { status: 'unavailable', points: [] } : pts.length ? { status: 'ok', points: pts } : { status: 'empty', points: [] } });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!key) return { status: 'idle', points: [] };
  return state.key === key ? state.s : { status: 'loading', points: [] };
}
