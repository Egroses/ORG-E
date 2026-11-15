import type { CatalogueSource } from '../sky/catalogue';
import { API_BASE } from './realProvider';

// The only place that knows the shape of GET /api/catwise?ra&dec&radius&limit (backend/docs/spectrum-api.md section 4):
// [{name, ra, dec, w1, w2, pmra, pmdec, pm_snr}]. Positions are already at epoch 2026.0, proper motion is in mas/yr.
// CatWISE may split a fast mover into several entries; they are all kept.

interface CatwiseRow {
  name?: string;
  ra: number;
  dec: number;
  w1?: number | null;
  w2?: number | null;
  pmra?: number | null;
  pmdec?: number | null;
  pm_snr?: number | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function adaptCatwise(rows: unknown): CatalogueSource[] {
  if (!Array.isArray(rows)) return [];
  const out: CatalogueSource[] = [];
  for (const r of rows as CatwiseRow[]) {
    if (typeof r?.ra !== 'number' || typeof r?.dec !== 'number' || !Number.isFinite(r.ra) || !Number.isFinite(r.dec)) continue;
    const name = String(r.name ?? `${r.ra.toFixed(5)}${r.dec >= 0 ? '+' : ''}${r.dec.toFixed(5)}`);
    out.push({
      id: `wise-${name}`,
      name: name.startsWith('J') ? `CatWISE ${name}` : name,
      ra: r.ra,
      dec: r.dec,
      pmRa: num(r.pmra) ?? 0,
      pmDec: num(r.pmdec) ?? 0,
      gmag: null,
      w1: num(r.w1),
      w2: num(r.w2),
      pmSnr: num(r.pm_snr),
      origin: 'wise',
    });
  }
  return out;
}

export type CatwiseResult = { ok: true; sources: CatalogueSource[] } | { ok: false; reason: 'archive' | 'unreachable' };

/** Errors stay errors: a 503 (archive down), any other failure or no network gives { ok: false }, never made-up sources. */
export async function fetchCatwise(
  ra: number, dec: number, radiusDeg: number, base = API_BASE, fetchImpl: typeof fetch = (...a) => fetch(...a),
): Promise<CatwiseResult> {
  try {
    const res = await fetchImpl(`${base}/api/catwise?ra=${ra}&dec=${dec}&radius=${radiusDeg}`);
    if (!res.ok) return { ok: false, reason: res.status === 503 ? 'archive' : 'unreachable' };
    return { ok: true, sources: adaptCatwise(await res.json()) };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}
