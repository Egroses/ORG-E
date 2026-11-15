// Exports saved copies of the API answers for the five practice targets, so the app can still open them
// when the live service is down.   Usage: node scripts/export-static.mjs --api http://localhost:8000 [--only barnard,rdra] [--groups normal]
// Node 18+, no dependencies. Payloads are written exactly as the API returns them (no pre-gzip; hosts gzip).
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Positions copied from pipeline/targets.json (the backend snaps cached targets by position).
export const TARGETS = {
  barnard: { ra: 269.446271, dec: 4.768197 },
  epsindb: { ra: 331.096658, dec: -56.800657 },
  wise0855: { ra: 133.759871, dec: -7.242252 },
  rwaur: { ra: 76.95659, dec: 30.401293 },
  rdra: { ra: 248.167233, dec: 66.755024 },
};
// Same numbers as src/data/provider.ts (CASE_EPOCHS / DEFAULT_EPOCHS) and src/data/catalog.ts (GROUPINGS).
const GAME_GROUP = (id) => (id === 'rdra' ? { gap: 60, span: 150 } : { gap: 30, span: 60 });
const GROUPS = { fine: { gap: 10, span: 30 }, normal: { gap: 30, span: 60 }, coarse: { gap: 60, span: 150 } };
const FOV = 0.1;
const GAIA_RADIUS = (FOV / 2) * 1.5; // useCatalogue.ts: (fovDeg / 2) * 1.5

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const api = (opt('api', 'http://localhost:8000')).replace(/\/$/, '');
const only = opt('only', '')?.split(',').filter(Boolean);
const groups = (opt('groups', 'fine,normal,coarse')).split(',').filter(Boolean);
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'public', 'static');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPatch(q) {
  const url = `${api}/api/patch?ra=${q.ra}&dec=${q.dec}&fov=${FOV}&dets=${q.dets.join(',')}&gap_days=${q.gap}&max_span_days=${q.span}`;
  const t0 = Date.now();
  for (;;) {
    const res = await fetch(url);
    const text = await res.text();
    if (res.status === 200 || res.status === 202) {
      const body = JSON.parse(text);
      if (body.status === 'done') return text;
      if (body.status === 'failed') throw new Error(`failed: ${JSON.stringify(body.error)}`);
    } else throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    if (Date.now() - t0 > 10 * 60_000) throw new Error('timeout (10 min)');
    await sleep(2000);
  }
}

await mkdir(join(out, 'patch'), { recursive: true });
const files = [];
const errors = [];
const targets = Object.keys(TARGETS).filter((id) => !only?.length || only.includes(id));
for (const id of targets) {
  const c = TARGETS[id];
  const jobs = [
    { name: `${id}.game`, kind: 'game', dets: [2, 4, 6], ...GAME_GROUP(id) },
    ...groups.map((g) => ({ name: `${id}.realistic.${g}`, kind: 'realistic', group: g, dets: [1, 2, 3, 4, 5, 6], ...GROUPS[g] })),
  ];
  for (const j of jobs) {
    try {
      const text = await getPatch({ ...c, ...j });
      const body = JSON.parse(text);
      await writeFile(join(out, 'patch', `${j.name}.json`), text);
      files.push({ file: `patch/${j.name}.json`, target: id, kind: j.kind, group: j.group ?? null, dets: j.dets, gap_days: j.gap, max_span_days: j.span, fov: FOV, ra: c.ra, dec: c.dec, bytes: Buffer.byteLength(text), epochs: body.epochs?.length, data_release: body.data_release ?? null });
      console.log(`ok   ${j.name}  ${(Buffer.byteLength(text) / 1e6).toFixed(2)} MB  ${body.epochs?.length} epochs`);
    } catch (e) { errors.push(`${j.name}: ${e.message}`); console.error(`FAIL ${j.name}: ${e.message}`); }
  }
  try {
    const res = await fetch(`${api}/api/gaia?ra=${c.ra}&dec=${c.dec}&radius=${GAIA_RADIUS}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    JSON.parse(text);
    await writeFile(join(out, 'patch', `${id}.gaia.json`), text);
    files.push({ file: `patch/${id}.gaia.json`, target: id, kind: 'gaia', radius_deg: GAIA_RADIUS, ra: c.ra, dec: c.dec, bytes: Buffer.byteLength(text), data_release: null });
    console.log(`ok   ${id}.gaia`);
  } catch (e) { errors.push(`${id}.gaia: ${e.message}`); console.error(`FAIL ${id}.gaia: ${e.message}`); }
}

const index = {
  generated_at: new Date().toISOString(),
  api_base_note: `Exported from ${api} (GET /api/patch and /api/gaia); payloads are verbatim API answers. Re-run: npm run export-static -- --api <url>`,
  targets: targets.map((id) => ({ id, ...TARGETS[id] })),
  files,
};
await writeFile(join(out, 'index.json'), JSON.stringify(index, null, 1));
console.log(`index.json: ${files.length} files, ${(files.reduce((s, f) => s + f.bytes, 0) / 1e6).toFixed(1)} MB`);
if (errors.length) { console.error('Errors:\n' + errors.join('\n')); process.exit(1); }
