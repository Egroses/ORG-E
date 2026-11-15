import { describe, expect, it, vi } from 'vitest';
import { cleanName, resolveName, ResolveError } from './resolve';
import { lookupName, parseCoords } from './astro';
import { searchErrorKey } from '../lib/useSearchSubmit';
import { translate } from '../i18n';

const resp = (status: number, body: unknown) => ({ status, ok: status < 400, json: async () => body }) as unknown as Response;
const f = (r: Response | Error) => vi.fn(async () => { if (r instanceof Error) throw r; return r; }) as unknown as typeof fetch;

const PROXIMA = {
  query: 'Proxima Centauri', name: 'NAME Proxima Centauri',
  catalog: { ra: 217.428942, dec: -62.67949, epoch: 2000.0 },
  current: { ra: 217.369445, dec: -62.67392, epoch: 2026.0 },
  pmra: -3781.741, pmdec: 769.465, parallax: 768.0665, source: 'simbad',
};

describe('resolveName', () => {
  it('uses the 2026.0 position and cleans the official name', async () => {
    const fetchImpl = f(resp(200, PROXIMA));
    const r = await resolveName(' Proxima Centauri ', { base: '', fetchImpl });
    expect(r).toEqual({ name: 'Proxima Centauri', ra: 217.369445, dec: -62.67392, epoch: 2026 });
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/resolve?q=Proxima%20Centauri');
  });
  it('encodes special characters', async () => {
    const fetchImpl = f(resp(200, PROXIMA));
    await resolveName('LHS 292 & co/+', { base: '', fetchImpl });
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/resolve?q=LHS%20292%20%26%20co%2F%2B');
  });
  it('maps 400, 404, 5xx, network failure and a broken answer to a kind', async () => {
    await expect(resolveName('x', { fetchImpl: f(resp(400, { error: { code: 'bad_input', message: 'm' } })) })).rejects.toMatchObject({ kind: 'badQuery' });
    await expect(resolveName('x', { fetchImpl: f(resp(404, { error: { code: 'not_found', message: 'm' } })) })).rejects.toMatchObject({ kind: 'notFound' });
    await expect(resolveName('x', { fetchImpl: f(resp(502, {})) })).rejects.toMatchObject({ kind: 'service' });
    await expect(resolveName('x', { fetchImpl: f(new TypeError('failed')) })).rejects.toMatchObject({ kind: 'unreachable' });
    await expect(resolveName('x', { fetchImpl: f(resp(200, { name: 'a', current: { ra: 'x', dec: 1 } })) })).rejects.toBeInstanceOf(ResolveError);
    await expect(resolveName('x', { fetchImpl: f(resp(200, { name: 'a', current: { ra: 400, dec: 1 } })) })).rejects.toMatchObject({ kind: 'service' });
  });
  it('lets an abort through unchanged', async () => {
    await expect(resolveName('x', { fetchImpl: f(new DOMException('a', 'AbortError')) })).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('strips SIMBAD prefixes', () => {
    expect(cleanName('NAME Barnard\'s Star')).toBe("Barnard's Star");
    expect(cleanName('* alf Cen A')).toBe('alf Cen A');
    expect(cleanName('V* R Dra')).toBe('R Dra');
  });
});

describe('what needs no network', () => {
  it('built-in names and coordinates are understood locally', () => {
    expect(lookupName('Barnard')).toBe('barnard');
    expect(parseCoords('133.79 -7.24')).toEqual({ ra: 133.79, dec: -7.24 });
    expect(lookupName('Proxima Centauri')).toBeNull();
    expect(parseCoords('Proxima Centauri')).toBeNull();
  });
  it('every error code has a text in both languages', () => {
    for (const c of ['badQuery', 'notFound', 'unreachable', 'service', 'invalid']) {
      expect(translate('en', searchErrorKey(c)).length).toBeGreaterThan(10);
      expect(translate('tr', searchErrorKey(c)).length).toBeGreaterThan(10);
    }
  });
});
