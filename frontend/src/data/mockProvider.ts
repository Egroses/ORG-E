import type { LoadStep, PatchRequest, SkyDataProvider, SkyPatch } from './types';
import { BANDS, EPOCHS, PIXEL_SCALE } from './catalog';
import { knownObjectsList, mjdToYear, propagate, skyToPixel } from '../sky/astro';

// Realistic dummy data: real pixel scale, real epoch dates, real proper motions,
// sub-pixel PSF placement and per-epoch noise. Motion is never exaggerated.

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rnd: () => number) {
  let u = 0;
  while (u === 0) u = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

// Abramowitz & Stegun 7.1.26
function erf(x: number) {
  const s = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return s * y;
}

const SQRT2 = Math.SQRT2;
const frac = (c: number, sigma: number, i: number) =>
  0.5 * (erf((i + 0.5 - c) / (sigma * SQRT2)) - erf((i - 0.5 - c) / (sigma * SQRT2)));

function addPsf(img: Float32Array, size: number, x0: number, y0: number, flux: number, sigma: number) {
  const r = Math.ceil(sigma * 4) + 1;
  const xi0 = Math.max(0, Math.floor(x0) - r), xi1 = Math.min(size - 1, Math.floor(x0) + r);
  const yi0 = Math.max(0, Math.floor(y0) - r), yi1 = Math.min(size - 1, Math.floor(y0) + r);
  for (let y = yi0; y <= yi1; y++) {
    const fy = frac(y0, sigma, y);
    if (fy < 1e-5) continue;
    for (let x = xi0; x <= xi1; x++) {
      img[y * size + x] += flux * fy * frac(x0, sigma, x);
    }
  }
}

const PSF_SIGMA = [0.55, 0.65, 0.78]; // pixels, per band
const SATURATION = 300;

function seedFor(ra: number, dec: number) {
  return (Math.round(ra * 1000) * 73856093) ^ (Math.round((dec + 90) * 1000) * 19349663);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function buildMockPatch(req: PatchRequest): SkyPatch {
  const size = Math.max(16, Math.round((req.fovDeg * 3600) / PIXEL_SCALE));
  const rnd = mulberry32(seedFor(req.ra, req.dec));
  const patch: SkyPatch = {
    center: { ra: req.ra, dec: req.dec },
    fovDeg: req.fovDeg,
    size,
    pixelScale: PIXEL_SCALE,
    epochs: EPOCHS,
    bands: BANDS,
    frames: [],
    flags: [],
    noise: [],
    source: 'mock',
  };

  // Field stars: fixed on the sky (distant), most bluish, some red.
  const area = req.fovDeg * req.fovDeg;
  const nStars = Math.round(Math.min(700, Math.max(18, area * 4200)));
  const stars = Array.from({ length: nStars }, () => {
    const red = rnd() < 0.22;
    const total = 6 + Math.pow(rnd(), 3.2) * 260;
    return {
      x: rnd() * (size - 1),
      y: rnd() * (size - 1),
      flux: red ? [total * 0.6, total * 0.75, total * 0.8] : [total, total * 0.5, total * 0.34],
    };
  });

  // Known objects inside the field, placed where they are on each epoch's date.
  const known = knownObjectsList();

  // A cosmic-ray hit (one sharp pixel on one epoch, one band) and two hot pixels.
  const glitch = { x: Math.floor(rnd() * size), y: Math.floor(rnd() * size), epoch: 1, band: 1 };
  const hot = [0, 1].map(() => ({ x: Math.floor(rnd() * size), y: Math.floor(rnd() * size) }));

  EPOCHS.forEach((ep, e) => {
    const frameRow: Float32Array[] = [];
    const flagRow: Uint8Array[] = [];
    const noiseRow: number[] = [];
    const year = mjdToYear(ep.mjd);
    BANDS.forEach((band, b) => {
      const img = new Float32Array(size * size);
      const flags = new Uint8Array(size * size);
      const sigma = PSF_SIGMA[b];
      const nrnd = mulberry32(seedFor(req.ra, req.dec) + e * 7919 + b * 104729);
      const noise = Math.sqrt(64 / ep.imageCount);
      for (const s of stars) addPsf(img, size, s.x, s.y, s.flux[b], sigma);
      for (const obj of known) {
        const pos = propagate(obj, year);
        const p = skyToPixel(patch, pos.ra, pos.dec);
        if (p.x < -3 || p.y < -3 || p.x > size + 2 || p.y > size + 2) continue;
        addPsf(img, size, p.x, p.y, obj.snr[band.id] * obj.variability[e], sigma);
      }
      for (let i = 0; i < img.length; i++) img[i] += noise * gaussian(nrnd);
      if (e === glitch.epoch && b === glitch.band) img[glitch.y * size + glitch.x] += 40;
      for (const h of hot) {
        img[h.y * size + h.x] = 12;
        flags[h.y * size + h.x] = 1;
      }
      for (let i = 0; i < img.length; i++) {
        if (img[i] > SATURATION) {
          img[i] = SATURATION;
          flags[i] = 1;
        }
      }
      frameRow.push(img);
      flagRow.push(flags);
      noiseRow.push(noise);
    });
    patch.frames.push(frameRow);
    patch.flags.push(flagRow);
    patch.noise.push(noiseRow);
  });
  return patch;
}

export const mockProvider: SkyDataProvider = {
  async getPatch(req, onStep?: (s: LoadStep) => void) {
    if (req.cached) {
      await wait(250);
    } else {
      onStep?.('finding');
      await wait(700);
      onStep?.('downloading');
      await wait(1400);
      onStep?.('stacking');
      await wait(600);
    }
    const patch = buildMockPatch(req);
    onStep?.('done');
    return patch;
  },
};
