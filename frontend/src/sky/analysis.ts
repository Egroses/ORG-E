import type { BandId, Chip, KnownObject, Outcome, Pt, SkyPatch } from '../data/types';
import type { Epoch } from '../data/types';
import { mjdToYear, propagate, skyToPixel } from './astro';
import { num, t } from '../i18n';

export interface AnswerKey {
  positions: Pt[];
  /** How close (grid pixels) a mark must be to count as a hit. */
  hitRadius: number;
  motionPx: number;
  motionArcsec: number;
  bestBand: BandId;
  fluxes: number[];
  changePct: number;
  changeSigma: number;
  /** False when every band is saturated around the star: its brightness cannot be measured from these photos. */
  reliable: boolean;
  /** Share of the star's aperture that is flagged (saturated) in the chosen band, 0 to 1. */
  flaggedShare: number;
  accepted: Chip[];
  /** What the answer key says, as data. Turn it into a sentence with `truthText`, in the language on screen. */
  truthParts: TruthPart[];
}

export type TruthPart =
  | { kind: 'moved'; px: number; arcsec: number; first: Epoch; last: Epoch }
  | { kind: 'movedSmall'; px: number; arcsec: number }
  | { kind: 'bright'; pct: number }
  | { kind: 'saturated' }
  | { kind: 'variable' }
  | { kind: 'none' };

/** The answer-key sentence in the current language (made from `truthParts` every time, so a language switch shows at once). */
export function truthText(key: AnswerKey): string {
  const part = (p: TruthPart) => {
    switch (p.kind) {
      case 'moved': return t('truth.moved', { px: num(p.px, 1), arcsec: num(p.arcsec, 1), first: p.first.label, last: p.last.label });
      case 'movedSmall': return t('truth.movedSmall', { px: num(p.px, 1), arcsec: num(p.arcsec, 1) });
      case 'bright': return t('truth.bright', { pct: p.pct });
      case 'saturated': return t('truth.saturated');
      case 'variable': return t('truth.variable');
      case 'none': return t('truth.none');
    }
  };
  return key.truthParts.map(part).join('. ') + '.';
}

/** The game's tolerances are written in native SPHEREx pixels (6.15 arcsec); real patches use a finer grid. */
const NATIVE_PX = 6.15;

/** A band whose aperture is flagged in at least this share of its pixels is treated as saturated and is not used to
 *  judge brightness. Measured on real SPHEREx data: Barnard's Star is about 98% flagged at 1.4 and 3.1 µm, where the
 *  "brightness change" between visits is an artefact (+34%), and about 50% at 4.7 µm, where it is stable within 1%. */
const SATURATED_SHARE = 0.7;

function aperture(frame: Float32Array, size: number, x: number, y: number, r: number, flags?: Uint8Array) {
  let sum = 0;
  let n = 0;
  let bad = 0;
  for (let j = Math.floor(y - r); j <= Math.ceil(y + r); j++) {
    for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) {
      if (i < 0 || j < 0 || i >= size || j >= size) continue;
      if ((i - x) ** 2 + (j - y) ** 2 > r * r) continue;
      sum += frame[j * size + i];
      if (flags && flags[j * size + i]) bad++;
      n++;
    }
  }
  return { sum, n, bad };
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
  const k = NATIVE_PX / patch.pixelScale; // grid pixels per native pixel
  const first = positions[0];
  const last = positions[positions.length - 1];
  const motionPx = Math.hypot(last.x - first.x, last.y - first.y) / k;
  const motionArcsec = motionPx * NATIVE_PX;

  const bands = patch.bands.map((b) => b.id);
  const radius = 1.8 * k;
  // How much of the star's aperture is flagged (saturated) in each band, averaged over the photos. A band without
  // a photo in some visit has an all-flagged frame there, so it is never preferred.
  const flaggedShares = bands.map((_, bi) => {
    let bad = 0;
    let n = 0;
    positions.forEach((p, e) => {
      const a = aperture(patch.frames[e][bi], patch.size, p.x, p.y, radius, patch.flags[e][bi]);
      bad += a.bad;
      n += a.n;
    });
    return n > 0 ? bad / n : 1;
  });
  const usable = bands.map((_, bi) => bi).filter((bi) => flaggedShares[bi] < SATURATED_SHARE);
  const reliable = usable.length > 0;
  // Reliable bands: the one with the best catalogue signal. If every band is saturated: the least flagged one.
  const pool = reliable ? usable : bands.map((_, bi) => bi);
  const b = pool.reduce((best, cand) =>
    (reliable ? obj.snr[bands[cand]] > obj.snr[bands[best]] : flaggedShares[cand] < flaggedShares[best]) ? cand : best, pool[0]);
  const bestBand = bands[b];
  const flaggedShare = flaggedShares[b];
  const meas = positions.map((p, e) => {
    const a = aperture(patch.frames[e][b], patch.size, p.x, p.y, radius, patch.flags[e][b]);
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
  const bright = reliable && changeSigma > 5 && changePct > 15;

  const accepted = new Set<Chip>();
  const parts: TruthPart[] = [];
  if (moved) {
    accepted.add('moved');
    parts.push({ kind: 'moved', px: motionPx, arcsec: motionArcsec, first: patch.epochs[0], last: patch.epochs[patch.epochs.length - 1] });
  } else if (borderline) {
    accepted.add('moved');
    accepted.add('noclear');
    accepted.add('unsure');
    parts.push({ kind: 'movedSmall', px: motionPx, arcsec: motionArcsec });
  }
  if (bright) {
    accepted.add('bright');
    parts.push({ kind: 'bright', pct: Math.round(changePct) });
  }
  if (!reliable) {
    parts.push({ kind: 'saturated' });
    if (obj.variable) {
      accepted.add('bright');
      parts.push({ kind: 'variable' });
    }
  }
  if (accepted.size === 0) {
    accepted.add('noclear');
    accepted.add('unsure');
    parts.push({ kind: 'none' });
  }
  return {
    positions, hitRadius: 2.5 * k, motionPx, motionArcsec, bestBand, fluxes, changePct, changeSigma, reliable, flaggedShare,
    accepted: [...accepted],
    truthParts: parts,
  };
}

export function evaluate(key: AnswerKey, mark: Pt | null, chips: Chip[], gaveUp: boolean) {
  const hit = !!mark && key.positions.some((p) => Math.hypot(mark.x - p.x, mark.y - p.y) <= key.hitRadius);
  const real = chips.filter((c) => c !== 'unsure');
  const chipsOk = real.length > 0
    ? real.every((c) => key.accepted.includes(c))
    : chips.includes('unsure') && key.accepted.includes('unsure');
  let outcome: Outcome = 'miss';
  if (!gaveUp) outcome = hit && chipsOk ? 'great' : hit || chipsOk ? 'partial' : 'miss';
  return { hit, chipsOk, outcome };
}
