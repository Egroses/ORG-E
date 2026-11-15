// Layout maths for the two small SVG charts (flux versus date, flux versus wavelength).
// Pure functions so they can be unit-tested; the components in components/Charts.tsx only draw what is computed here.

import { shortDate } from '../lib/format';
import { dec, num, sig, t } from '../i18n';
import type { FluxSeries } from './photometry';

export interface Box { w: number; h: number; left: number; right: number; top: number; bottom: number }
export const DEFAULT_BOX: Box = { w: 340, h: 190, left: 46, right: 10, top: 10, bottom: 28 };

/** "Nice" tick values covering [min, max] with about `count` steps. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return out;
}

export interface ChartMarker {
  /** Series index and the original point index, so the table and the chart can be cross-checked. */
  series: number;
  index: number;
  cx: number;
  cy: number;
  /** Error bar ends in pixels (y1 is the top). */
  y0: number;
  y1: number;
  /** Hollow marker: a lower limit (flux chart) or a flagged point (spectrum). */
  hollow: boolean;
  label: string;
}

export interface ChartLayout {
  box: Box;
  xTicks: { x: number; label: string }[];
  yTicks: { y: number; label: string }[];
  markers: ChartMarker[];
  /** One polyline per series (points in pixel space), only for series with at least two points. */
  lines: { series: number; points: [number, number][] }[];
  /** Pixel row of flux = 0 when it is inside the plot, else null. */
  zeroY: number | null;
  yDomain: [number, number];
  xDomain: [number, number];
}

const fmtTick = (v: number) => {
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return dec(v.toFixed(1).replace(/\.0$/, ''));
  return dec(v.toPrecision(2));
};

function build(
  xs: number[][], ys: number[][], es: number[][], hollow: boolean[][], labels: string[][], box: Box,
  xDomain: [number, number], xLabel: (v: number) => string, xTickValues: number[],
): ChartLayout {
  let lo = 0, hi = 0;
  let first = true;
  ys.forEach((row, s) => row.forEach((v, i) => {
    const a = v - es[s][i], b = v + es[s][i];
    if (first) { lo = Math.min(0, a); hi = b; first = false; } else { lo = Math.min(lo, a); hi = Math.max(hi, b); }
  }));
  if (first || !(hi > lo)) { lo = 0; hi = 1; }
  const pad = (hi - lo) * 0.06;
  const yDomain: [number, number] = [lo < 0 ? lo - pad : 0, hi + pad];
  const pw = box.w - box.left - box.right, ph = box.h - box.top - box.bottom;
  const X = (v: number) => box.left + ((v - xDomain[0]) / (xDomain[1] - xDomain[0])) * pw;
  const Y = (v: number) => box.top + (1 - (v - yDomain[0]) / (yDomain[1] - yDomain[0])) * ph;
  const markers: ChartMarker[] = [];
  const lines: ChartLayout['lines'] = [];
  xs.forEach((row, s) => {
    row.forEach((x, i) => markers.push({
      series: s, index: i, cx: X(x), cy: Y(ys[s][i]), y0: Y(ys[s][i] - es[s][i]), y1: Y(ys[s][i] + es[s][i]),
      hollow: hollow[s][i], label: labels[s][i],
    }));
    if (row.length > 1) lines.push({ series: s, points: row.map((x, i) => [X(x), Y(ys[s][i])] as [number, number]) });
  });
  return {
    box,
    xTicks: xTickValues.map((v) => ({ x: X(v), label: xLabel(v) })),
    yTicks: niceTicks(yDomain[0], yDomain[1], 4).map((v) => ({ y: Y(v), label: fmtTick(v) })),
    markers, lines,
    zeroY: yDomain[0] <= 0 && yDomain[1] >= 0 ? Y(0) : null,
    yDomain, xDomain,
  };
}

/** Flux (mJy) versus date, one series per band. Lower limits are hollow. Uses only measured points. */
export function fluxChartLayout(series: FluxSeries[], box: Box = DEFAULT_BOX): ChartLayout {
  const all = series.flatMap((s) => s.points.map((p) => p.mjd));
  const lo = all.length ? Math.min(...all) : 0, hi = all.length ? Math.max(...all) : 1;
  const span = Math.max(hi - lo, 30);
  const xDomain: [number, number] = [lo - span * 0.06, lo + span * 1.06];
  const ticks = [0, 1, 2, 3].map((k) => xDomain[0] + ((xDomain[1] - xDomain[0]) * k) / 3);
  return build(
    series.map((s) => s.points.map((p) => p.mjd)),
    series.map((s) => s.points.map((p) => p.flux)),
    series.map((s) => s.points.map((p) => p.err)),
    series.map((s) => s.points.map((p) => p.lowerLimit)),
    series.map((s) => s.points.map((p) => `${s.bandId} ${shortDate(p.mjd)}: ${p.lowerLimit ? '≥ ' : ''}${sig(p.flux, 3)} ± ${sig(p.err, 2)} mJy`)),
    box, xDomain, shortDate, ticks,
  );
}

export interface SpectrumPoint {
  wavelength_um: number;
  flux_mjy: number;
  err_mjy: number;
  mjd?: number;
  detector?: number;
  flagged?: boolean;
}

/** Validates the answer of GET /api/spectrum; rows without finite numbers are dropped. */
export function adaptSpectrum(rows: unknown): SpectrumPoint[] {
  if (!Array.isArray(rows)) return [];
  const out: SpectrumPoint[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const w = Number(r?.wavelength_um), f = Number(r?.flux_mjy);
    if (!Number.isFinite(w) || !Number.isFinite(f)) continue;
    const e = Number(r?.err_mjy);
    out.push({
      wavelength_um: w, flux_mjy: f, err_mjy: Number.isFinite(e) && e >= 0 ? e : 0,
      mjd: Number.isFinite(Number(r?.mjd)) ? Number(r.mjd) : undefined,
      detector: Number.isFinite(Number(r?.detector)) ? Number(r.detector) : undefined,
      flagged: !!r?.flagged,
    });
  }
  return out.sort((a, b) => a.wavelength_um - b.wavelength_um);
}

/** Flux (mJy) versus wavelength (micrometres) with error bars; flagged points are hollow. */
export function spectrumChartLayout(points: SpectrumPoint[], box: Box = DEFAULT_BOX): ChartLayout {
  const xDomain: [number, number] = [0.7, 5.1];
  return build(
    [points.map((p) => p.wavelength_um)],
    [points.map((p) => p.flux_mjy)],
    [points.map((p) => p.err_mjy)],
    [points.map((p) => !!p.flagged)],
    [points.map((p) => `${num(p.wavelength_um, 3)} µm: ${sig(p.flux_mjy, 3)} ± ${sig(p.err_mjy, 2)} mJy${p.flagged ? ' ' + t('chart.flaggedPoint') : ''}`)],
    box, xDomain, (v) => num(v, 1), [1, 2, 3, 4, 5],
  );
}

/** A label that would cross the edge of the chart is anchored to that edge instead of being centred on its tick. */
export function tickAnchor(x: number, label: string, width: number): 'start' | 'middle' | 'end' {
  const half = label.length * 3.3 + 2; // about 6.6 px per character at 10 px mono
  if (x - half < 0) return 'start';
  if (x + half > width) return 'end';
  return 'middle';
}
