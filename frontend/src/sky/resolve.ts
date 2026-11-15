// Name lookup through GET /api/resolve?q=... (SIMBAD behind the data service). The answer already carries the
// position moved to 2026.0 (`current`), which is the field centre; the catalogue position is not used.

import { API_BASE } from '../data/realProvider';

export interface Resolved {
  /** The official name, without SIMBAD's "NAME " / "* " prefix. */
  name: string;
  ra: number;
  dec: number;
  epoch: number;
}

export type ResolveFailure = 'badQuery' | 'notFound' | 'unreachable' | 'service';

export class ResolveError extends Error {
  kind: ResolveFailure;
  constructor(kind: ResolveFailure) {
    super(kind);
    this.name = 'ResolveError';
    this.kind = kind;
  }
}

interface ResolveBody {
  name?: string;
  query?: string;
  current?: { ra?: number; dec?: number; epoch?: number };
}

export const cleanName = (s: string) => s.replace(/^(NAME|\*\*|V\*|\*)\s+/i, '').replace(/\s+/g, ' ').trim();

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export async function resolveName(
  q: string,
  opts: { base?: string; fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<Resolved> {
  const base = opts.base ?? API_BASE;
  const doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  let res: Response;
  try {
    res = await doFetch(`${base}/api/resolve?q=${encodeURIComponent(q.trim())}`, opts.signal ? { signal: opts.signal } : undefined);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ResolveError('unreachable');
  }
  if (res.status === 400) throw new ResolveError('badQuery');
  if (res.status === 404) throw new ResolveError('notFound');
  if (!res.ok) throw new ResolveError('service');
  let body: ResolveBody;
  try {
    body = (await res.json()) as ResolveBody;
  } catch {
    throw new ResolveError('service');
  }
  const c = body.current;
  if (!c || !finite(c.ra) || !finite(c.dec) || c.ra < 0 || c.ra >= 360 || Math.abs(c.dec) > 90) throw new ResolveError('service');
  return { name: cleanName(body.name || body.query || q), ra: c.ra, dec: c.dec, epoch: finite(c.epoch) ? c.epoch : 2026 };
}
