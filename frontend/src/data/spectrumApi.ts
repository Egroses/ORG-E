import { useEffect, useState } from 'react';
import { API_BASE } from './realProvider';
import { adaptSpectrum, type SpectrumPoint } from '../sky/charts';
import { adaptChannels, type ChannelSpectrum } from '../sky/spectrum';

// GET /api/spectrum?ra=&dec=[&mode=102][&aperture=1|2|3] (backend/docs/spectrum-api.md sections 2 and 3).
//   mode=102 -> {center, aperture_px, unit, channels[...], warnings[]}   ("binned": 102 channels)
//   no mode  -> [{wavelength_um, flux_mjy, err_mjy, mjd, detector, flagged, saturated, masked_px, flag_names, lower_limit}]   ("all": one point per exposure)
// 404 no_coverage: no cached cutout covers the position. Errors stay errors: nothing is drawn from made-up data.

export type SpectrumView = 'binned' | 'all';
export type Aperture = 1 | 2 | 3;
export const APERTURES: Aperture[] = [1, 2, 3];
export const DEFAULT_APERTURE: Aperture = 2;

export type SpectrumFetch =
  | { kind: 'binned'; data: ChannelSpectrum }
  | { kind: 'all'; points: SpectrumPoint[] }
  | { kind: 'nocoverage' }
  | { kind: 'error'; status: number | null };

/** Never throws: network trouble and unexpected answers come back as { kind: 'error' }. */
export async function fetchSpectrum(
  ra: number, dec: number, view: SpectrumView = 'binned', aperture: Aperture = DEFAULT_APERTURE,
  base = API_BASE, fetchImpl: typeof fetch = (...a) => fetch(...a),
): Promise<SpectrumFetch> {
  try {
    const url = `${base}/api/spectrum?ra=${ra}&dec=${dec}${view === 'binned' ? '&mode=102' : ''}&aperture=${aperture}`;
    const res = await fetchImpl(url);
    if (!res.ok) {
      if (res.status === 404) {
        const body = await res.json().catch(() => null) as { error?: { code?: string } } | null;
        if (body?.error?.code === 'no_coverage') return { kind: 'nocoverage' };
      }
      return { kind: 'error', status: res.status };
    }
    const body = await res.json();
    if (view === 'binned') {
      const data = adaptChannels(body);
      return data ? { kind: 'binned', data } : { kind: 'error', status: null };
    }
    if (!Array.isArray(body)) return { kind: 'error', status: null };
    return { kind: 'all', points: adaptSpectrum(body) };
  } catch {
    return { kind: 'error', status: null };
  }
}

export interface SpectrumState {
  /** 'empty': the service answered but nothing is usable (no points, or every channel without a value). */
  status: 'idle' | 'loading' | 'ok' | 'empty' | 'nocoverage' | 'error';
  result: SpectrumFetch | null;
}

/** Loads the spectrum at a position (when there is one), again when the view or the aperture changes. */
export function useSpectrum(at: { ra: number; dec: number } | null, enabled: boolean, view: SpectrumView, aperture: Aperture): SpectrumState {
  const [state, setState] = useState<{ key: string; s: SpectrumState }>({ key: '', s: { status: 'idle', result: null } });
  const key = at && enabled ? `${at.ra.toFixed(5)},${at.dec.toFixed(5)},${view},${aperture}` : '';
  useEffect(() => {
    if (!key || !at) return;
    let live = true;
    fetchSpectrum(at.ra, at.dec, view, aperture).then((result) => {
      if (!live) return;
      const status: SpectrumState['status'] =
        result.kind === 'nocoverage' ? 'nocoverage'
          : result.kind === 'error' ? 'error'
            : result.kind === 'all' ? (result.points.length ? 'ok' : 'empty')
              : result.data.channels.some((c) => c.flux !== null) ? 'ok' : 'empty';
      setState({ key, s: { status, result } });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!key) return { status: 'idle', result: null };
  return state.key === key ? state.s : { status: 'loading', result: null };
}
