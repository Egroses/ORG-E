import type { BandId, Chip, KnownObject, Outcome, Pt, SkyPatch } from '../data/types';
import { mjdToYear, propagate, skyToPixel } from './astro';

export interface AnswerKey {
  positions: Pt[];
  motionPx: number;
  motionArcsec: number;
  bestBand: BandId;
  fluxes: number[];
  changePct: number;
  changeSigma: number;
  accepted: Chip[];
  truth: string;
}

function aperture(frame: Float32Array, size: number, x: number, y: number, r = 1.8) {
  let sum = 0;
  let n = 0;
  for (let j = Math.floor(y - r); j <= Math.ceil(y + r); j++) {
    for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) {
      if (i < 0 || j < 0 || i >= size || j >= size) continue;
      if ((i - x) ** 2 + (j - y) ** 2 > r * r) continue;
      sum += frame[j * size + i];
      n++;
    }
  }
  return { sum, n };
}

/**
 * The answer key is computed from catalogue motion and measured brightness, never typed in by hand,
 * so the same code adapts the practice cases when real SPHEREx cutouts replace the mock data.
 */
export function answerKey(patch: SkyPatch, obj: KnownObject): AnswerKey {
  const positions = patch.epochs.map((ep) => {
    const pos = propagate(obj, mjdToYear(ep.mjd));
    return skyToPixel(patch, pos.ra, pos.dec);
  });
  const first = positions[0];
  const last = positions[positions.length - 1];
  const motionPx = Math.hypot(last.x - first.x, last.y - first.y);
  const motionArcsec = motionPx * patch.pixelScale;

  const bands = patch.bands.map((b) => b.id);
  const bestBand = bands.reduce((best, id) => (obj.snr[id] > obj.snr[best] ? id : best), bands[0]);
  const b = bands.indexOf(bestBand);
  const meas = positions.map((p, e) => {
    const a = aperture(patch.frames[e][b], patch.size, p.x, p.y);
    return { flux: a.sum, err: Math.sqrt(a.n) * patch.noise[e][b] };
  });
  const fluxes = meas.map((m) => m.flux);
  const iMax = fluxes.indexOf(Math.max(...fluxes));
  const iMin = fluxes.indexOf(Math.min(...fluxes));
  const mean = fluxes.reduce((s, f) => s + f, 0) / fluxes.length;
  const diff = fluxes[iMax] - fluxes[iMin];
  const changeSigma = diff / Math.hypot(meas[iMax].err, meas[iMin].err);
  const changePct = mean > 0 ? (diff / mean) * 100 : 0;

  const moved = motionPx >= 1;
  const borderline = motionPx >= 0.4 && motionPx < 1;
  const bright = changeSigma > 5 && changePct > 15;

  const accepted = new Set<Chip>();
  const parts: string[] = [];
  const firstLabel = patch.epochs[0].label;
  const lastLabel = patch.epochs[patch.epochs.length - 1].label;
  if (moved) {
    accepted.add('moved');
    parts.push(`Moved ${motionPx.toFixed(1)} pixels (${motionArcsec.toFixed(1)}″) between ${firstLabel} and ${lastLabel}`);
  } else if (borderline) {
    accepted.add('moved');
    accepted.add('noclear');
    accepted.add('unsure');
    parts.push(`Moved ${motionPx.toFixed(1)} pixel (${motionArcsec.toFixed(1)}″), less than one pixel, so “No clear change” also counts`);
  }
  if (bright) {
    accepted.add('bright');
    parts.push(`Brightness changed by about ${Math.round(changePct)}%`);
  }
  if (accepted.size === 0) {
    accepted.add('noclear');
    accepted.add('unsure');
    parts.push('No clear change in these photos');
  }
  return {
    positions, motionPx, motionArcsec, bestBand, fluxes, changePct, changeSigma,
    accepted: [...accepted],
    truth: parts.join('. ') + '.',
  };
}

export function evaluate(key: AnswerKey, mark: Pt | null, chips: Chip[], gaveUp: boolean) {
  const hit = !!mark && key.positions.some((p) => Math.hypot(mark.x - p.x, mark.y - p.y) <= 2.5);
  const real = chips.filter((c) => c !== 'unsure');
  const chipsOk = real.length > 0
    ? real.every((c) => key.accepted.includes(c))
    : chips.includes('unsure') && key.accepted.includes('unsure');
  let outcome: Outcome = 'miss';
  if (!gaveUp) outcome = hit && chipsOk ? 'great' : hit || chipsOk ? 'partial' : 'miss';
  return { hit, chipsOk, outcome };
}
