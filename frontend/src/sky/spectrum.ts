// 102-channel spectrum (GET /api/spectrum?...&mode=102): decoding, blend detection and chart layout.
// Pure functions, unit-tested; components/SpectrumCharts.tsx only draws what is computed here.

import { sourceAt, type CatalogueSource } from './catalogue';
import { niceTicks, DEFAULT_BOX, type Box } from './charts';

export interface SpectrumChannel {
  detector: number;
  index: number;
  wavelengthUm: number;
  rangeUm: [number, number];
  /** null = no usable exposure in this channel: drawn as a gap, never as zero. */
  flux: number | null;
  err: number | null;
  nExposures: number;
  nSkipped: number;
  saturated: boolean;
  lowerLimit: boolean;
}

export interface ChannelSpectrum {
  center: { ra: number; dec: number };
  aperturePx: number;
  channels: SpectrumChannel[];
  warnings: string[];
}

const fin = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Validates the 102-channel answer. Returns null when the body is not that shape (the caller shows an error, not a made-up chart). */
export function adaptChannels(body: unknown): ChannelSpectrum | null {
  const b = body as { center?: { ra?: unknown; dec?: unknown }; aperture_px?: unknown; channels?: unknown; warnings?: unknown } | null;
  if (!b || !Array.isArray(b.channels)) return null;
  const channels: SpectrumChannel[] = [];
  for (const r of b.channels as Record<string, unknown>[]) {
    const w = fin(r?.wavelength_um);
    if (w === null) continue;
    const rg = Array.isArray(r.wavelength_range_um) ? r.wavelength_range_um : [];
    const lo = fin(rg[0]) ?? w, hi = fin(rg[1]) ?? w;
    const flux = fin(r.flux_mjy);
    const err = fin(r.err_mjy);
    channels.push({
      detector: fin(r.detector) ?? 0,
      index: fin(r.index) ?? channels.length,
      wavelengthUm: w,
      rangeUm: [Math.min(lo, hi), Math.max(lo, hi)],
      flux,
      err: flux === null ? null : err !== null && err >= 0 ? err : 0,
      nExposures: fin(r.n_exposures) ?? 0,
      nSkipped: fin(r.n_skipped) ?? 0,
      saturated: !!r.saturated,
      lowerLimit: !!r.lower_limit || !!r.saturated,
    });
  }
  channels.sort((a, c) => a.wavelengthUm - c.wavelengthUm);
  return {
    center: { ra: fin(b.center?.ra) ?? NaN, dec: fin(b.center?.dec) ?? NaN },
    aperturePx: fin(b.aperture_px) ?? 2,
    channels,
    warnings: Array.isArray(b.warnings) ? (b.warnings as unknown[]).filter((w): w is string => typeof w === 'string') : [],
  };
}

export interface SpectrumSummary {
  total: number;
  withValue: number;
  empty: number;
  saturated: number;
  lowerLimits: number;
  exposures: number;
  skipped: number;
}

export function summarize(channels: SpectrumChannel[]): SpectrumSummary {
  const withValue = channels.filter((c) => c.flux !== null);
  return {
    total: channels.length,
    withValue: withValue.length,
    empty: channels.length - withValue.length,
    saturated: channels.filter((c) => c.saturated).length,
    lowerLimits: withValue.filter((c) => c.lowerLimit).length,
    exposures: channels.reduce((s, c) => s + c.nExposures, 0),
    skipped: channels.reduce((s, c) => s + c.nSkipped, 0),
  };
}

const DEG = Math.PI / 180;
/** Small-angle separation in arcseconds (fine for the few arcminutes of a field). */
export function angularSeparationArcsec(ra1: number, dec1: number, ra2: number, dec2: number): number {
  let dra = ra2 - ra1;
  if (dra > 180) dra -= 360; else if (dra < -180) dra += 360;
  return Math.hypot(dra * Math.cos(((dec1 + dec2) / 2) * DEG), dec2 - dec1) * 3600;
}

export const SPHEREX_PIXEL_ARCSEC = 6.15;
/** Sources closer than this to the measured position are taken to be the target itself (less than a pixel; nothing separates them). */
export const SELF_RADIUS_ARCSEC = 4;

export interface Blend {
  source: CatalogueSource;
  distArcsec: number;
}

/**
 * Catalogue sources (Gaia, CatWISE) inside the aperture radius around the measured position, other than the target
 * itself. `year` is the date of the picture the position was marked on; sources are moved to it. The five built-in
 * practice objects are never counted: they stand for the target. Nearest first.
 */
export function findBlends(at: { ra: number; dec: number }, aperturePx: number, sources: CatalogueSource[], year: number): Blend[] {
  const reach = aperturePx * SPHEREX_PIXEL_ARCSEC;
  const out: Blend[] = [];
  for (const s of sources) {
    if (s.origin === 'known') continue;
    const p = sourceAt(s, year);
    const d = angularSeparationArcsec(at.ra, at.dec, p.ra, p.dec);
    if (d > SELF_RADIUS_ARCSEC && d <= reach) out.push({ source: s, distArcsec: d });
  }
  return out.sort((a, b) => a.distArcsec - b.distArcsec);
}

// ---------------------------------------------------------------- chart layout

export interface ChannelMarker {
  channel: SpectrumChannel;
  cx: number;
  cy: number;
  y0: number;
  y1: number;
  /** Horizontal extent of the wavelength range of the channel, pixels. */
  x0: number;
  x1: number;
  /** Lower limit or saturated: hollow marker with an upward arrow. */
  hollow: boolean;
}

export interface ChannelLayout {
  box: Box;
  xTicks: { x: number; label: string }[];
  yTicks: { y: number; label: string }[];
  markers: ChannelMarker[];
  /** Runs of neighbouring channels of one detector that all have a value; a missing channel breaks the line. */
  lines: { detector: number; points: [number, number][] }[];
  /** Channels without a value: x range, drawn as a grey tick on the bottom axis. */
  gaps: { x0: number; x1: number; channel: SpectrumChannel }[];
  zeroY: number | null;
}

export const SPECTRUM_X: [number, number] = [0.7, 5.1];

export function channelLayout(channels: SpectrumChannel[], fmtTick: (v: number) => string, box: Box = DEFAULT_BOX): ChannelLayout {
  const vals = channels.filter((c) => c.flux !== null);
  let lo = 0, hi = 0;
  vals.forEach((c, i) => {
    const a = (c.flux as number) - (c.err ?? 0), b = (c.flux as number) + (c.err ?? 0);
    if (i === 0) { hi = b; lo = Math.min(0, a); } else { lo = Math.min(lo, a); hi = Math.max(hi, b); }
  });
  if (!vals.length || !(hi > lo)) { lo = 0; hi = 1; }
  const pad = (hi - lo) * 0.06;
  const yLo = lo < 0 ? lo - pad : 0, yHi = hi + pad;
  const pw = box.w - box.left - box.right, ph = box.h - box.top - box.bottom;
  const X = (v: number) => box.left + ((v - SPECTRUM_X[0]) / (SPECTRUM_X[1] - SPECTRUM_X[0])) * pw;
  const Y = (v: number) => box.top + (1 - (v - yLo) / (yHi - yLo)) * ph;
  const markers: ChannelMarker[] = [];
  const gaps: ChannelLayout['gaps'] = [];
  const lines: ChannelLayout['lines'] = [];
  let run: ChannelLayout['lines'][number] | null = null;
  for (const c of channels) {
    if (c.flux === null) {
      gaps.push({ x0: X(c.rangeUm[0]), x1: X(c.rangeUm[1]), channel: c });
      run = null;
      continue;
    }
    const err = c.err ?? 0;
    markers.push({
      channel: c, cx: X(c.wavelengthUm), cy: Y(c.flux), y0: Y(c.flux - err), y1: Y(c.flux + err),
      x0: X(c.rangeUm[0]), x1: X(c.rangeUm[1]), hollow: c.lowerLimit,
    });
    if (!run || run.detector !== c.detector) { run = { detector: c.detector, points: [] }; lines.push(run); }
    run.points.push([X(c.wavelengthUm), Y(c.flux)]);
  }
  return {
    box,
    xTicks: [1, 2, 3, 4, 5].map((v) => ({ x: X(v), label: fmtTick(v) })),
    yTicks: niceTicks(yLo, yHi, 4).map((v) => ({ y: Y(v), label: fmtTick(v) })),
    markers, lines: lines.filter((l) => l.points.length > 1), gaps,
    zeroY: yLo <= 0 && yHi >= 0 ? Y(0) : null,
  };
}
