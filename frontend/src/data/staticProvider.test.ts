import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setLang } from '../i18n';
import { bytesToBase64, encodeFloat32 } from './decode';
import type { PatchPayload } from './realProvider';
import type { PatchRequest } from './types';

beforeAll(() => setLang('en', false));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

const BARNARD = { ra: 269.446271, dec: 4.768197 };
const frame = () => ({ data: encodeFloat32([1, 2, 3, 4]), flag_share: bytesToBase64(Uint8Array.from([0, 0, 0, 0])), noise: 1, n_images: 3 });
const payload = (dets: number[], epochs = 2): PatchPayload => ({
  status: 'done', source: 'irsa', center: BARNARD, fov_deg: 0.1, size: 2, pixel_scale_arcsec: 3.075,
  epochs: Array.from({ length: epochs }, (_, i) => ({ index: i, mjd_start: 100 + i * 50, mjd_end: 110 + i * 50, mjd_mean: 105 + i * 50, label: 'x', dates: 'x', n_images: Object.fromEntries(dets.map((d) => [String(d), 3])) })),
  bands: dets.map((d) => ({ detector: d, wavelength_um: [1, 2] as [number, number] })),
  frames: Array.from({ length: epochs }, () => dets.map(() => frame())),
});
const entry = (file: string, kind: string, extra: object) => ({ file, target: 'barnard', kind, ...BARNARD, fov: 0.1, ...extra });
const INDEX = {
  generated_at: '2026-11-15T12:00:00Z',
  files: [
    entry('patch/barnard.game.json', 'game', { dets: [2, 4, 6], gap_days: 30, max_span_days: 60 }),
    entry('patch/barnard.realistic.normal.json', 'realistic', { dets: [1, 2, 3, 4, 5, 6], gap_days: 30, max_span_days: 60, group: 'normal' }),
    entry('patch/barnard.gaia.json', 'gaia', { radius_deg: 0.075 }),
  ],
};
const GAIA = [{ source_id: '1', ra: 269.4463, dec: 4.7682, gmag: 8.2, pmra: 1, pmdec: 2 }];

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
/** Fake network: `live` answers /api/*, the static files are served from INDEX (or are absent when `withStatic` is false). */
function net(opts: { live: 'ok' | 'down' | 'failed' | 'http500'; withStatic?: boolean }) {
  const f = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/static/')) {
      if (opts.withStatic === false) return new Response('<html>', { status: 200 });
      if (url.endsWith('index.json')) return json(INDEX);
      if (url.endsWith('game.json')) return json(payload([2, 4, 6], 3));
      if (url.endsWith('realistic.normal.json')) return json(payload([1, 2, 3, 4, 5, 6], 3));
      if (url.endsWith('gaia.json')) return json(GAIA);
      return new Response('', { status: 404 });
    }
    if (opts.live === 'down') throw new TypeError('network');
    if (url.includes('/api/health')) return json({ status: 'ok' });
    if (url.includes('/api/gaia')) return opts.live === 'ok' ? json([{ source_id: '9', ra: 1, dec: 1 }]) : json({}, 500);
    if (opts.live === 'http500') return json({ status: 'failed', error: { code: 'internal_error', message: 'x' } }, 500);
    if (opts.live === 'failed') return json({ status: 'failed', error: { code: 'archive_unavailable', message: 'x' } });
    return json(payload(/dets=2,4,6/.test(url) ? [2, 4, 6] : [1, 2, 3, 4, 5, 6], 2));
  });
  vi.stubGlobal('fetch', f);
}
const game: PatchRequest = { ...BARNARD, fovDeg: 0.1, cached: true, gapDays: 30, maxSpanDays: 60 };
const realistic: PatchRequest = { ...BARNARD, fovDeg: 0.1, dets: [1, 2, 3, 4, 5, 6], gapDays: 30, maxSpanDays: 60, strict: true };

describe('static match', () => {
  it('matches by position (10 arcsec), detectors and grouping', async () => {
    net({ live: 'down' });
    const sp = await import('./staticProvider');
    const idx = INDEX as never;
    expect(sp.matchStaticEntry(game, idx)?.file).toBe('patch/barnard.game.json');
    expect(sp.matchStaticEntry(realistic, idx)?.file).toBe('patch/barnard.realistic.normal.json');
    expect(sp.matchStaticEntry({ ...game, dec: game.dec + 8 / 3600 }, idx)).not.toBeNull();
    expect(sp.matchStaticEntry({ ...game, dec: game.dec + 12 / 3600 }, idx)).toBeNull();
    expect(sp.matchStaticEntry({ ...game, gapDays: 10, maxSpanDays: 30 }, idx)).toBeNull();
    expect(sp.matchStaticEntry({ ...game, dets: [2, 4] }, idx)).toBeNull();
    expect(sp.matchStaticEntry({ ...game, fovDeg: 0.2 }, idx)).toBeNull();
    // Explore in Game view sends no grouping: it gets the Game copy.
    expect(sp.matchStaticEntry({ ra: game.ra, dec: game.dec, fovDeg: 0.1 }, idx)?.file).toBe('patch/barnard.game.json');
  });
  it('an alias entry (Coarse sharing the Normal file) resolves to the shared file and keeps its own grouping', async () => {
    net({ live: 'down' });
    const sp = await import('./staticProvider');
    const idx = { ...INDEX, files: [...INDEX.files, entry('patch/barnard.realistic.normal.json', 'realistic', { dets: [1, 2, 3, 4, 5, 6], gap_days: 60, max_span_days: 150, group: 'coarse', alias: true })] };
    const m = sp.matchStaticEntry({ ...realistic, gapDays: 60, maxSpanDays: 150 }, idx as never);
    expect(m?.file).toBe('patch/barnard.realistic.normal.json');
    expect(m?.gap_days).toBe(60);
  });
  it('returns a SkyPatch flagged as a saved copy', async () => {
    net({ live: 'down' });
    const sp = await import('./staticProvider');
    const p = await sp.getStaticPatch(game);
    expect(p?.savedCopy?.generatedAt).toBe('2026-11-15T12:00:00Z');
    expect(p?.epochs.length).toBe(3);
    expect(p?.bands.map((b) => b.id)).toEqual(['D2', 'D4', 'D6']);
    expect(p?.grouping).toEqual({ gapDays: 30, maxSpanDays: 60 });
    const i18n = await import('../i18n');
    i18n.setLang('en', false);
    expect(sp.savedCopyText(p!)).toBe('Showing a saved copy from 15 Nov 2026 (live service unavailable)');
    i18n.setLang('tr', false);
    expect(sp.savedCopyText(p!)).toContain('15 Kas 2026');
  });
  it('is null when there are no saved files (dev server answers index.html)', async () => {
    net({ live: 'down', withStatic: false });
    const sp = await import('./staticProvider');
    expect(await sp.getStaticPatch(game)).toBeNull();
  });
});

describe('provider fallback order', () => {
  it('live ok -> live, no notice', async () => {
    net({ live: 'ok' });
    const { provider } = await import('./provider');
    const p = await provider.getPatch(game);
    expect(p.savedCopy).toBeUndefined();
    expect(p.epochs.length).toBe(2);
  });
  for (const live of ['failed', 'http500'] as const) {
    it(`live ${live} -> static copy (Game and Realistic)`, async () => {
      net({ live });
      const { provider } = await import('./provider');
      expect((await provider.getPatch(game)).savedCopy).toBeTruthy();
      expect((await provider.getPatch(realistic)).savedCopy).toBeTruthy();
    });
  }
  it('API down at start -> static copy, never mock', async () => {
    net({ live: 'down' });
    const { provider } = await import('./provider');
    const g = await provider.getPatch(game);
    expect(g.source).toBe('irsa');
    expect(g.savedCopy).toBeTruthy();
    expect((await provider.getPatch(realistic)).savedCopy).toBeTruthy();
  });
  it('no static file: a clear noService / server error, NEVER mock (Game and strict alike)', async () => {
    net({ live: 'down', withStatic: false });
    const { provider } = await import('./provider');
    await expect(provider.getPatch(game)).rejects.toMatchObject({ kind: 'noService' });
    await expect(provider.getPatch(realistic)).rejects.toMatchObject({ kind: 'noService' });
    net({ live: 'failed', withStatic: false });
    vi.resetModules();
    const m = await import('./provider');
    await expect(m.provider.getPatch(game)).rejects.toMatchObject({ kind: 'server' });
    await expect(m.provider.getPatch(realistic)).rejects.toMatchObject({ kind: 'server' });
    net({ live: 'down', withStatic: false });
    vi.resetModules();
    const { errorText, DataError } = await import('./errors');
    const err = await (await import('./provider')).provider.getPatch(game).catch((e) => e);
    expect(err).toBeInstanceOf(DataError);
    const i18n = await import('../i18n');
    i18n.setLang('en', false);
    expect(errorText(err)).toMatch(/no saved copy/);
    i18n.setLang('tr', false);
    expect(errorText(err)).toMatch(/kayıtlı kopya yok/);
    i18n.setLang('en', false);
  });
  it('?data=mock is the only way to get demo data, and it is flagged', async () => {
    net({ live: 'ok' });
    vi.stubGlobal('window', { location: { search: '?data=mock' } });
    const m = await import('./provider');
    expect(m.isMockForced()).toBe(true);
    expect(m.getDataMode()).toBe('mock');
    expect((await m.provider.getPatch(game)).source).toBe('mock');
    expect((await m.provider.getPatch(realistic)).source).toBe('mock');
    vi.stubGlobal('window', { location: { search: '' } });
    expect(m.isMockForced()).toBe(false);
    expect(m.getDataMode()).toBe('real');
  });
  it('non-cached coordinates stay errors', async () => {
    net({ live: 'failed' });
    const { provider } = await import('./provider');
    await expect(provider.getPatch({ ra: 10, dec: 10, fovDeg: 0.1, dets: [2], strict: true })).rejects.toMatchObject({ kind: 'server' });
    await expect(provider.getPatch({ ra: 10, dec: 10, fovDeg: 0.1 })).rejects.toMatchObject({ kind: 'server' });
  });
});

describe('gaia fallback order', () => {
  it('live first, then the saved copy at a target position, then null', async () => {
    net({ live: 'ok' });
    let { fetchGaia } = await import('./gaiaApi');
    expect((await fetchGaia(BARNARD.ra, BARNARD.dec, 0.075))?.[0].id).toBe('gaia-9');
    net({ live: 'down' });
    vi.resetModules();
    ({ fetchGaia } = await import('./gaiaApi'));
    expect((await fetchGaia(BARNARD.ra, BARNARD.dec, 0.075))?.[0].id).toBe('gaia-1');
    expect(await fetchGaia(10, 10, 0.075)).toBeNull();
  });
});
