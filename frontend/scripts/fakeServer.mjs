// A tiny stand-in for the data service, for checking the real-data path without the archive.
// It answers /api/health, /api/patch (in the exact format of docs/patch-api.md, with one 202 "running" answer first
// for uncached requests) and /api/gaia. The sky is synthetic: it is NOT SPHEREx data.
//
//   node scripts/fakeServer.mjs [port]      (default 8000; Vite proxies /api to it)
import http from 'node:http';

const PORT = Number(process.argv[2] ?? 8000);
const PS = 3.075; // arcsec per grid pixel
const MJDS = [60801.1, 61001.0, 61162.7];
const LABELS = ['May 2025', 'Nov 2025', 'May 2026'];
const DATES = ['5-6 May 2025', '31 Oct - 13 Dec 2025', '21 Apr - 14 May 2026'];
const NIMG = [30, 128, 100];
const MJD_J2000 = 51544.5;
const year = (mjd) => 2000 + (mjd - MJD_J2000) / 365.25;

// name, ra, dec at 2026.0 is computed from these catalogue values (same numbers as src/data/catalog.ts)
const KNOWN = [
  { ra: 269.452083, dec: 4.693389, ref: 2000.0, pmRa: -802, pmDec: 10362, snr: [900, 420, 260], var: [1, 1, 1] },
  { ra: 133.795125, dec: -7.245139, ref: 2010.5, pmRa: -8118, pmDec: 673, snr: [0.5, 6, 45], var: [1, 1, 1] },
  { ra: 331.043833, dec: -56.782694, ref: 2000.0, pmRa: 3966, pmDec: -2536, snr: [30, 12, 18], var: [1, 1, 1] },
  { ra: 76.956417, dec: 30.401417, ref: 2000.0, pmRa: 0, pmDec: 0, snr: [70, 55, 50], var: [1.0, 0.55, 1.15] },
  { ra: 248.167458, dec: 66.754972, ref: 2000.0, pmRa: 0, pmDec: 0, snr: [160, 90, 60], var: [0.45, 1.0, 0.65] },
];
const at2026 = (o) => {
  const dt = 2026 - o.ref;
  return { ra: o.ra + (o.pmRa * dt) / 3.6e6 / Math.cos((o.dec * Math.PI) / 180), dec: o.dec + (o.pmDec * dt) / 3.6e6 };
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const b64 = (bytes) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');

function sourcesFor(ra, dec) {
  const near = KNOWN.find((o) => {
    const p = at2026(o);
    return Math.abs(p.ra - ra) < 0.2 && Math.abs(p.dec - dec) < 0.2;
  });
  const mover = near ?? { ra, dec, ref: 2026.0, pmRa: 0, pmDec: 2200, snr: [200, 150, 120], var: [1, 1, 1] };
  const r = rng(Math.round(ra * 1000) ^ Math.round(dec * 1000));
  const stars = Array.from({ length: 40 }, () => ({ dra: (r() - 0.5) * 0.09, ddec: (r() - 0.5) * 0.09, snr: [30 + r() * 300, 15 + r() * 120, 10 + r() * 60], var: [1, 1, 1], pmRa: 0, pmDec: 0, ref: 2026 }));
  return { mover, stars };
}

function buildPatch(ra, dec, fov) {
  const size = Math.round((fov * 3600) / PS);
  const c = (size - 1) / 2;
  const { mover, stars } = sourcesFor(ra, dec);
  const all = [{ o: mover, abs: true }, ...stars.map((s) => ({ o: { ...s, ra: ra + s.dra, dec: dec + s.ddec }, abs: true }))];
  const sigma = [1.0, 1.15, 1.35];
  const noiseMJy = 0.02;
  const frames = MJDS.map((mjd, e) =>
    [2, 4, 6].map((det, bi) => {
      // The longest band has no exposure in the last visit for one special request (tests the empty-frame path).
      if (fov === 0.25 && bi === 2 && e === 2) return null;
      const data = new Float32Array(size * size);
      const flag = new Uint8Array(size * size);
      const rnd = rng(e * 7919 + bi * 104729 + size);
      for (let i = 0; i < data.length; i++) data[i] = noiseMJy * ((rnd() + rnd() + rnd() + rnd() - 2) * 1.7) * Math.sqrt(30 / NIMG[e]) * 2;
      for (const { o } of all) {
        const dt = year(mjd) - o.ref;
        const sra = o.ra + (o.pmRa * dt) / 3.6e6 / Math.cos((o.dec * Math.PI) / 180);
        const sdec = o.dec + (o.pmDec * dt) / 3.6e6;
        const x0 = c - (((sra - ra) * Math.cos((dec * Math.PI) / 180)) * 3600) / PS;
        const y0 = c - ((sdec - dec) * 3600) / PS;
        const amp = (o.snr[bi] * o.var[e] * noiseMJy) / (2 * Math.PI * sigma[bi] ** 2);
        const R = Math.ceil(sigma[bi] * 4);
        for (let j = Math.max(0, Math.floor(y0) - R); j <= Math.min(size - 1, Math.floor(y0) + R); j++) {
          for (let i = Math.max(0, Math.floor(x0) - R); i <= Math.min(size - 1, Math.floor(x0) + R); i++) {
            data[j * size + i] += amp * Math.exp(-((i - x0) ** 2 + (j - y0) ** 2) / (2 * sigma[bi] ** 2));
          }
        }
      }
      // masked (NaN) hot pixel and flagged cosmic-ray pixel
      data[5 * size + 5] = NaN;
      flag[40 * size + 40] = 255;
      flag[41 * size + 40] = 60;
      return { data: b64(data), noise: noiseMJy * Math.sqrt(30 / NIMG[e]) * 2 * 0.85, flag_share: b64(flag), n_images: Math.round(NIMG[e] / 3) };
    }));
  return {
    status: 'done', id: `fake${size}`, source: 'irsa', contract: 1, center: { ra, dec }, fov_deg: fov, size,
    pixel_scale_arcsec: PS, unit: 'MJy/sr', orientation: 'row 0 = north, column 0 = east',
    epochs: MJDS.map((m, e) => ({
      index: e, mjd_start: m - 3, mjd_end: m + 3, mjd_mean: m, label: LABELS[e], dates: DATES[e],
      n_images: { 2: Math.round(NIMG[e] / 3), 4: Math.round(NIMG[e] / 3), 6: Math.round(NIMG[e] / 3) },
    })),
    bands: [{ detector: 2, wavelength_um: [1.1, 1.62] }, { detector: 4, wavelength_um: [2.42, 3.82] }, { detector: 6, wavelength_um: [4.42, 5.0] }],
    frames, data_release: { collections: { dr1: 10, qr3: 4, dr1_deep: 0, qr3_deep: 0 }, latest_mjd: 61300 }, warnings: [],
  };
}

const seen = new Map();
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (code, body) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (u.pathname === '/api/health') return send(200, { status: 'ok' });
  if (u.pathname === '/api/patch') {
    const ra = Number(u.searchParams.get('ra'));
    const dec = Number(u.searchParams.get('dec'));
    const fov = Number(u.searchParams.get('fov') ?? 0.1);
    const k = `${ra.toFixed(4)},${dec.toFixed(4)},${fov}`;
    const cachedCase = KNOWN.some((o) => Math.abs(at2026(o).ra - ra) < 0.2 && Math.abs(at2026(o).dec - dec) < 0.2);
    if (!cachedCase) {
      const n = (seen.get(k) ?? 0) + 1;
      seen.set(k, n);
      if (n === 1) return send(202, { status: 'queued', id: 'x', progress: { total: 4, done: 0, failed: 0 } });
      if (n === 2) return send(202, { status: 'running', id: 'x', progress: { total: 4, done: 2, failed: 0 } });
    }
    return send(200, buildPatch(ra, dec, fov));
  }
  if (u.pathname === '/api/gaia') {
    const ra = Number(u.searchParams.get('ra'));
    const dec = Number(u.searchParams.get('dec'));
    const { mover, stars } = sourcesFor(ra, dec);
    const m = at2026(mover);
    const rows = [{ source_id: '4472832130942575872', ra: m.ra, dec: m.dec, gmag: 9.5, pmra: mover.pmRa, pmdec: mover.pmDec }];
    stars.forEach((s, i) => rows.push({ source_id: String(1000 + i), ra: ra + s.dra, dec: dec + s.ddec, gmag: 14 + (i % 5), pmra: 1.2, pmdec: -0.8 }));
    return send(200, rows);
  }
  return send(404, { error: { code: 'not_found', message: 'unknown route' } });
});
server.listen(PORT, () => console.log(`fake data service on http://localhost:${PORT}`));
