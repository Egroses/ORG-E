import { describe, expect, it } from 'vitest';
import { adaptCatwise, fetchCatwise } from './catwiseApi';

const rows = [
  { name: 'J085506.91-071437.5', ra: 133.7600592, dec: -7.2425984, w1: 19.456, w2: 15.541, pmra: -7919.9, pmdec: 493.9, pm_snr: 52.15 },
  { name: 'J085508.34-071439.2', ra: 133.760353, dec: -7.2418234, w1: 18.507, w2: 15.721, pmra: -7965.0, pmdec: 806.2, pm_snr: 41.97 },
  { name: 'J085501.95-071428.2', ra: 133.758148, dec: -7.2412101, w1: null, w2: 15.202, pmra: -5.88, pmdec: -10.4, pm_snr: null },
  { name: 'broken' },
];
const mock = (status: number, json?: unknown) => (async () => ({ ok: status < 300, status, json: async () => json })) as unknown as typeof fetch;

describe('CatWISE decoding', () => {
  it('maps fields, keeps near-duplicates, null pm_snr and missing magnitudes, and drops broken rows', () => {
    const out = adaptCatwise(rows);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ origin: 'wise', name: 'CatWISE J085506.91-071437.5', pmRa: -7919.9, pmDec: 493.9, pmSnr: 52.15, w1: 19.456, w2: 15.541, gmag: null });
    expect(out[2]).toMatchObject({ pmSnr: null, w1: null, w2: 15.202 });
    expect(new Set(out.map((s) => s.id)).size).toBe(3);
    expect(adaptCatwise(null)).toEqual([]);
    expect(adaptCatwise({})).toEqual([]);
  });
  it('fetches /api/catwise with the radius', async () => {
    let url = '';
    const f = (async (u: string) => { url = u; return { ok: true, status: 200, json: async () => rows }; }) as unknown as typeof fetch;
    const r = await fetchCatwise(133.76, -7.24, 0.075, '', f);
    expect(url).toBe('/api/catwise?ra=133.76&dec=-7.24&radius=0.075');
    expect(r.ok && r.sources.length).toBe(3);
  });
  it('503 is the archive being down; other failures are unreachable; no fake sources either way', async () => {
    expect(await fetchCatwise(1, 2, 0.075, '', mock(503, { error: { code: 'archive_unavailable' } }))).toEqual({ ok: false, reason: 'archive' });
    expect(await fetchCatwise(1, 2, 0.075, '', mock(500))).toEqual({ ok: false, reason: 'unreachable' });
    const boom = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await fetchCatwise(1, 2, 0.075, '', boom)).toEqual({ ok: false, reason: 'unreachable' });
  });
});
