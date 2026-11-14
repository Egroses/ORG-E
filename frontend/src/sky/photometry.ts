// Aperture photometry per band and visit for one marked source, in physical units.
//
// Method (plain, no model): sum of (pixel - local sky) inside a circular aperture, local sky = median of an annulus
// just outside it, both over valid pixels only. Units: frames are stored in noise units, so
// MJy/sr = value * patch.noiseRefMJySr; one pixel subtends (pixelScale / 206265)^2 steradians, so
// flux[mJy] = sum[MJy/sr] * omega_pixel * 1e9.
// The uncertainty is noise * sqrt(N pixels) for uncorrelated pixels. The pixels of a patch are resampled onto a grid
// finer than the detector pixel, so neighbouring pixels are correlated and the true error is larger. We say so in the UI.

import type { Pt, SkyPatch } from '../data/types';
import { FLAG_SHARE_THRESHOLD } from '../data/realProvider';
import type { Measurement } from './measure';

const ARCSEC_PER_RAD = 206264.806;
/** Aperture radius on the sky, arcseconds (two native detector pixels). */
export const APERTURE_ARCSEC = 12.3;
/** An aperture with at least this share of flagged or empty pixels gives only a lower limit. */
export const LOWER_LIMIT_SHARE = 0.3;

/** Solid angle of one patch pixel, steradians. */
export const pixelSolidAngle = (pixelScaleArcsec: number) => (pixelScaleArcsec / ARCSEC_PER_RAD) ** 2;

/** Surface-brightness sum in MJy/sr * pixel to flux in mJy. */
export const mjySrPixToMilliJy = (sum: number, pixelScaleArcsec: number) => sum * pixelSolidAngle(pixelScaleArcsec) * 1e9;

export interface PhotometryCell {
  epoch: number;
  band: number;
  status: 'ok' | 'nophoto';
  /** Sum of sky-subtracted surface brightness in the aperture, MJy/sr * pixel. */
  sumMJySrPix: number;
  sumErrMJySrPix: number;
  fluxMJy: number;
  errMJy: number;
  /** Share of aperture pixels flagged in at least 20% of the exposures. */
  flaggedShare: number;
  /** Share of aperture pixels with no data. */
  nodataShare: number;
  /** True when too much of the aperture is flagged or empty: the true flux is higher than the number. */
  lowerLimit: boolean;
  /** Number of valid pixels used. */
  nPix: number;
}

const EMPTY: Omit<PhotometryCell, 'epoch' | 'band'> = {
  status: 'nophoto', sumMJySrPix: 0, sumErrMJySrPix: 0, fluxMJy: 0, errMJy: 0, flaggedShare: 0, nodataShare: 0, lowerLimit: false, nPix: 0,
};

const median = (v: number[]) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[s.length >> 1];
};

/** Aperture photometry of one frame at pixel position `at`. Needs `patch.noiseRefMJySr`. */
export function aperturePhotometry(patch: SkyPatch, epoch: number, band: number, at: Pt, apertureArcsec = APERTURE_ARCSEC): PhotometryCell {
  const ref = patch.noiseRefMJySr;
  if (!ref || patch.missing?.[epoch]?.[band]) return { ...EMPTY, epoch, band };
  const n = patch.size;
  const img = patch.frames[epoch][band];
  const nod = patch.nodata?.[epoch]?.[band];
  const share = patch.flagShare?.[epoch]?.[band];
  const flg = patch.flags[epoch][band];
  const r = apertureArcsec / patch.pixelScale;
  const sky: number[] = [];
  let sum = 0, nPix = 0, total = 0, nFlag = 0, nNone = 0;
  const R = Math.ceil(r * 2.6);
  for (let j = Math.round(at.y) - R; j <= Math.round(at.y) + R; j++) {
    for (let i = Math.round(at.x) - R; i <= Math.round(at.x) + R; i++) {
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const d = Math.hypot(i - at.x, j - at.y);
      const k = j * n + i;
      const empty = !!nod?.[k];
      if (d <= r) {
        total++;
        if (empty) { nNone++; continue; }
        if (share ? share[k] >= FLAG_SHARE_THRESHOLD : flg[k]) nFlag++;
        nPix++;
      } else if (d > r * 1.5 && d <= r * 2.5 && !empty) {
        sky.push(img[k]);
      }
    }
  }
  if (!total || !nPix) return { ...EMPTY, epoch, band, nodataShare: total ? nNone / total : 1 };
  const bg = median(sky);
  for (let j = Math.round(at.y) - R; j <= Math.round(at.y) + R; j++) {
    for (let i = Math.round(at.x) - R; i <= Math.round(at.x) + R; i++) {
      if (i < 0 || j < 0 || i >= n || j >= n || Math.hypot(i - at.x, j - at.y) > r) continue;
      const k = j * n + i;
      if (!nod?.[k]) sum += img[k] - bg;
    }
  }
  const sumMJy = sum * ref;
  const errMJy = patch.noise[epoch][band] * ref * Math.sqrt(nPix);
  const flaggedShare = nFlag / total;
  const nodataShare = nNone / total;
  return {
    epoch, band, status: 'ok',
    sumMJySrPix: sumMJy, sumErrMJySrPix: errMJy,
    fluxMJy: mjySrPixToMilliJy(sumMJy, patch.pixelScale), errMJy: mjySrPixToMilliJy(errMJy, patch.pixelScale),
    flaggedShare, nodataShare,
    lowerLimit: flaggedShare + nodataShare >= LOWER_LIMIT_SHARE,
    nPix,
  };
}

/**
 * Where the source is at each visit. A measured position is used where there is one; between or beyond measured
 * visits the position is interpolated (held at the ends) by date. Without a measurement the marked pixel is used.
 */
export function positionsByVisit(patch: SkyPatch, mark: Pt, m: Measurement | null): Pt[] {
  const pts = m && m.status === 'ok' ? m.points : [];
  if (!pts.length) return patch.epochs.map(() => mark);
  return patch.epochs.map((ep, e) => {
    const exact = pts.find((p) => p.epoch === e);
    if (exact) return { x: exact.x, y: exact.y };
    const before = [...pts].reverse().find((p) => p.epoch < e);
    const after = pts.find((p) => p.epoch > e);
    if (before && after) {
      const t0 = patch.epochs[before.epoch].mjd, t1 = patch.epochs[after.epoch].mjd;
      const f = t1 > t0 ? (ep.mjd - t0) / (t1 - t0) : 0;
      return { x: before.x + f * (after.x - before.x), y: before.y + f * (after.y - before.y) };
    }
    const p = before ?? after!;
    return { x: p.x, y: p.y };
  });
}

/** Photometry table: cells[band][epoch]. */
export function photometryTable(patch: SkyPatch, positions: Pt[]): PhotometryCell[][] {
  return patch.bands.map((_, b) => patch.epochs.map((_, e) => aperturePhotometry(patch, e, b, positions[e])));
}

export interface FluxPoint {
  mjd: number;
  epoch: number;
  flux: number;
  err: number;
  lowerLimit: boolean;
}
export interface FluxSeries {
  bandIndex: number;
  bandId: string;
  color: string;
  points: FluxPoint[];
}

/** Flux versus date per band, from the table; visits without a photo are left out (no invented points). */
export function fluxSeries(patch: SkyPatch, table: PhotometryCell[][]): FluxSeries[] {
  return patch.bands.map((bd, b) => ({
    bandIndex: b,
    bandId: bd.id,
    color: bd.color,
    points: table[b]
      .filter((c) => c.status === 'ok')
      .map((c) => ({ mjd: patch.epochs[c.epoch].mjd, epoch: c.epoch, flux: c.fluxMJy, err: c.errMJy, lowerLimit: c.lowerLimit })),
  }));
}

export interface Ratio {
  epoch: number;
  value: number | null;
  err: number | null;
  /** True when either flux is a lower limit, so the ratio is not a measurement. */
  limited: boolean;
}

/** Flux ratio of band `num` over band `den` per visit, with propagated uncertainty. Null where a flux is missing or not positive. */
export function bandRatio(table: PhotometryCell[][], num: number, den: number): Ratio[] {
  return table[num].map((cn, e) => {
    const cd = table[den][e];
    if (cn.status !== 'ok' || cd.status !== 'ok' || !(cd.fluxMJy > 0) || !(cn.fluxMJy > 0)) {
      return { epoch: e, value: null, err: null, limited: cn.lowerLimit || cd.lowerLimit };
    }
    const v = cn.fluxMJy / cd.fluxMJy;
    const err = v * Math.hypot(cn.errMJy / cn.fluxMJy, cd.errMJy / cd.fluxMJy);
    return { epoch: e, value: v, err, limited: cn.lowerLimit || cd.lowerLimit };
  });
}

/** Position angle of an offset, degrees east of north, 0 to 360. */
export function positionAngle(east: number, north: number): number {
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}

/** Share of the field's pixels that are flagged (in at least 20% of the exposures) and share with no data, for one frame. */
export function fieldShares(patch: SkyPatch, epoch: number, band: number): { flagged: number; nodata: number } | null {
  if (patch.missing?.[epoch]?.[band]) return null;
  const n = patch.size * patch.size;
  const nod = patch.nodata?.[epoch]?.[band];
  const share = patch.flagShare?.[epoch]?.[band];
  const flg = patch.flags[epoch][band];
  let f = 0, d = 0;
  for (let i = 0; i < n; i++) {
    if (nod?.[i]) { d++; continue; }
    if (share ? share[i] >= FLAG_SHARE_THRESHOLD : flg[i]) f++;
  }
  return { flagged: f / n, nodata: d / n };
}
