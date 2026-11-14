import type { CatalogueSource } from '../sky/catalogue';
import { API_BASE } from './realProvider';

// The only place that knows the shape of GET /api/gaia (backend/app/models.py GaiaSource):
// [{source_id, ra, dec, gmag, pmra, pmdec}], positions already moved to 2026.0, proper motion in mas/yr.

interface GaiaRow {
  source_id?: string | number;
  ra: number;
  dec: number;
  gmag?: number | null;
  pmra?: number | null;
  pmdec?: number | null;
}

export function adaptGaia(rows: unknown): CatalogueSource[] {
  if (!Array.isArray(rows)) return [];
  const out: CatalogueSource[] = [];
  for (const r of rows as GaiaRow[]) {
    if (typeof r?.ra !== 'number' || typeof r?.dec !== 'number') continue;
    const id = String(r.source_id ?? `${r.ra.toFixed(5)}${r.dec.toFixed(5)}`);
    out.push({
      id: `gaia-${id}`,
      name: `DR3 ${id}`,
      ra: r.ra,
      dec: r.dec,
      pmRa: r.pmra ?? 0,
      pmDec: r.pmdec ?? 0,
      gmag: r.gmag ?? null,
      origin: 'gaia',
    });
  }
  return out;
}

/** Returns null when the service is unavailable, so the feature can hide itself. */
export async function fetchGaia(ra: number, dec: number, radiusDeg: number, base = API_BASE): Promise<CatalogueSource[] | null> {
  try {
    const res = await fetch(`${base}/api/gaia?ra=${ra}&dec=${dec}&radius=${radiusDeg}`);
    if (!res.ok) return null;
    return adaptGaia(await res.json());
  } catch {
    return null;
  }
}
