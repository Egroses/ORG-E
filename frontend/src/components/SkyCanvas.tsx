import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CompareMode, Detail, Pt, SkyPatch } from '../data/types';
import { maskedMean, paintDiff, paintImage, refNoise, sharedStretch, subtract, unionMask, type Stretch, type StretchFn } from '../sky/render';
import { formatMJySr } from '../lib/format';
import { formatDec, formatRa, pixelToSky } from '../sky/astro';
import { num } from '../i18n';
import { useI18n } from '../i18n/react';

export interface Ring {
  x: number;
  y: number;
  color: string;
  /** Radius in image pixels. */
  r?: number;
  label?: string;
  dashed?: boolean;
  /** Square outline (WISE) instead of a circle (Gaia, known objects). */
  square?: boolean;
  /** Drawn faint: an entry that may be one piece of a split fast mover. */
  muted?: boolean;
}

/** A proper-motion arrow in image pixels, from the source to where it will be after the stated time. */
export interface Arrow {
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: string;
  /** Drawn faint, like its mark. */
  muted?: boolean;
}

interface Props {
  patch: SkyPatch;
  epoch: number;
  band: number;
  mode?: CompareMode;
  detail?: Detail;
  invert?: boolean;
  magnify?: boolean;
  grid?: boolean;
  /** Bilinear smoothing instead of square pixels. */
  smooth?: boolean;
  mark?: Pt | null;
  rings?: Ring[];
  path?: Pt[];
  arrows?: Arrow[];
  pathColor?: string;
  /** Point the magnifier zooms around. Defaults to the mark, then the centre. */
  focus?: Pt | null;
  onTap?: (p: Pt) => void;
  tapLabel?: string;
  className?: string;
  children?: ReactNode;
  /** The full scientific frame: RA/Dec gutters, compass, scale bar and cursor read-out. */
  chrome?: boolean;
  /** Paint flagged (unreliable or saturated) pixels in magenta. */
  showFlags?: boolean;
  /** Display-only brightness and contrast (CSS filter), 1 = unchanged. */
  brightness?: number;
  contrast?: number;
  stretch?: StretchFn;
  /** Explicit stretch (low and high cut, function). Overrides `detail` and `stretch`. Used by Realistic mode. */
  stretchOverride?: Stretch;
  /** Quality layer drawn over the picture: share of exposures that flagged each pixel, or heavily flagged pixels. */
  quality?: 'none' | 'flagshare' | 'heavy';
  /** Read-out in MJy/sr with its noise (needs patch.noiseRefMJySr), instead of noise units. */
  physical?: boolean;
  /** Visit that Difference mode subtracts. Default: the first. */
  refEpoch?: number;
  /** Visits that Stack mode adds. Default: all with a photo. */
  stackEpochs?: number[];
}

/** A pixel flagged in at least half of the exposures: in practice mostly saturated stellar cores. */
export const HEAVY_FLAG_SHARE = 128;

const ZOOM = 2.5;
const MAX_ZOOM = 10;

interface View { k: number; cx: number; cy: number }
/** Keeps the zoomed picture inside the frame: the view centre stays within [0.5/k, 1 - 0.5/k]. */
function clampView(v: View): View {
  const lo = 0.5 / v.k, hi = 1 - 0.5 / v.k;
  return { k: v.k, cx: Math.min(hi, Math.max(lo, v.cx)), cy: Math.min(hi, Math.max(lo, v.cy)) };
}
const NICE_ARCSEC = [5, 10, 20, 30, 60, 120, 300, 600];

function arcLabel(a: number) {
  return a >= 60 ? `${a / 60}′` : `${a}″`;
}

/** Label placement that never lets two labels overlap: earlier rings win, later ones are dropped. */
function placeLabels(items: { x: number; y: number; r: number; text: string }[], w: number, h: number) {
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const out: { left: number; top: number; text: string }[] = [];
  for (const it of items) {
    const bw = it.text.length * 6.6 + 8;
    const bh = 16;
    const options = [
      { x0: it.x + it.r + 4, y0: it.y - bh / 2 },
      { x0: it.x - it.r - 4 - bw, y0: it.y - bh / 2 },
      { x0: it.x - bw / 2, y0: it.y - it.r - 4 - bh },
      { x0: it.x - bw / 2, y0: it.y + it.r + 4 },
    ];
    for (const o of options) {
      const box = { x0: o.x0, y0: o.y0, x1: o.x0 + bw, y1: o.y0 + bh };
      if (box.x0 < 2 || box.y0 < 2 || box.x1 > w - 2 || box.y1 > h - 2) continue;
      if (placed.some((p) => box.x0 < p.x1 + 3 && box.x1 > p.x0 - 3 && box.y0 < p.y1 + 2 && box.y1 > p.y0 - 2)) continue;
      placed.push(box);
      out.push({ left: box.x0, top: box.y0, text: it.text });
      break;
    }
  }
  return out;
}

export function SkyCanvas({
  patch, epoch, band, mode = 'blink', detail = 'standard', invert = false, magnify = false, grid = false, smooth = false,
  mark = null, rings = [], path, arrows = [], pathColor = '#9aa4b2', focus = null, onTap, tapLabel, className = '', children,
  chrome = false, showFlags = false, brightness = 1, contrast = 1, stretch: stretchFn = 'asinh',
  stretchOverride, quality = 'none', physical = false, refEpoch = 0, stackEpochs,
}: Props) {
  const { t } = useI18n();
  const keyHelpId = useId();
  const ref = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [cursor, setCursor] = useState<Pt | null>(null);
  const size = patch.size;
  const bandFrames = useMemo(() => patch.frames.map((f) => f[band]), [patch, band]);
  const noiseRef = refNoise(patch.noise, band);
  const bandMasks = useMemo(() => patch.nodata?.map((n) => n[band]) ?? [], [patch, band]);
  const stretch = useMemo(
    () => stretchOverride ?? { ...sharedStretch(bandFrames, noiseRef, detail), fn: stretchFn },
    [bandFrames, noiseRef, detail, stretchFn, stretchOverride],
  );
  const stackKey = stackEpochs?.join(',');
  const stack = useMemo(() => {
    if (mode !== 'stack') return null;
    const use = (stackEpochs ?? bandFrames.map((_, e) => e)).filter((e) => !patch.missing?.[e]?.[band]);
    if (!use.length) return null;
    return maskedMean(use.map((e) => bandFrames[e]), use.map((e) => bandMasks[e]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bandFrames, bandMasks, mode, stackKey, patch, band]);
  const stackStretch = useMemo(
    () => (stack ? (stretchOverride ?? { ...sharedStretch([stack.data], noiseRef * 0.6, detail), fn: stretchFn }) : null),
    [stack, noiseRef, detail, stretchFn, stretchOverride],
  );

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(size, size);
    const here = bandMasks[epoch];
    if (mode === 'diff') {
      const d = subtract(bandFrames[epoch], bandFrames[refEpoch]);
      paintDiff(img, d, 6 * Math.max(patch.noise[epoch][band], patch.noise[refEpoch][band]), unionMask(here, bandMasks[refEpoch]));
    } else if (mode === 'stack' && stack && stackStretch) {
      paintImage(img, stack.data, stackStretch, patch.bands[band].tint, invert, stack.nodata);
    } else {
      paintImage(img, bandFrames[epoch], stretch, patch.bands[band].tint, invert, here);
    }
    const share = patch.flagShare?.[epoch]?.[band];
    if (quality !== 'none' && share && !patch.missing?.[epoch]?.[band]) {
      const o = img.data;
      for (let i = 0; i < share.length; i++) {
        if (here?.[i]) continue;
        const v = share[i];
        if (quality === 'flagshare') {
          if (!v) continue;
          const t = v / 255;
          const a = 0.25 + 0.6 * t;
          // yellow (few exposures flagged) to magenta (all of them)
          const cr = 255, cg = 214 - 170 * t, cb = 40 + 150 * t;
          o[i * 4] = o[i * 4] * (1 - a) + cr * a;
          o[i * 4 + 1] = o[i * 4 + 1] * (1 - a) + cg * a;
          o[i * 4 + 2] = o[i * 4 + 2] * (1 - a) + cb * a;
        } else if (v >= HEAVY_FLAG_SHARE) {
          o[i * 4] = o[i * 4] * 0.35 + 255 * 0.65;
          o[i * 4 + 1] = o[i * 4 + 1] * 0.35 + 40 * 0.65;
          o[i * 4 + 2] = o[i * 4 + 2] * 0.35 + 160 * 0.65;
        }
      }
    }
    if (showFlags && !patch.missing?.[epoch]?.[band]) {
      const fl = patch.flags[epoch][band];
      const o = img.data;
      for (let i = 0; i < fl.length; i++) {
        if (fl[i]) {
          o[i * 4] = o[i * 4] * 0.35 + 255 * 0.65;
          o[i * 4 + 1] = o[i * 4 + 1] * 0.35 + 40 * 0.65;
          o[i * 4 + 2] = o[i * 4 + 2] * 0.35 + 160 * 0.65;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [bandFrames, bandMasks, epoch, band, mode, stretch, stack, stackStretch, invert, patch, size, showFlags, quality, refEpoch]);

  const pct = (v: number) => ((v + 0.5) / size) * 100;
  // View model: screen fraction f = 0.5 + (imageFraction - c) * k. The magnifier button gives a preset view (k = ZOOM,
  // the mark stays where it is); the wheel, the +/- buttons and dragging replace it with the reader's own view.
  const anchor = focus ?? mark;
  const presetK = magnify ? ZOOM : 1;
  const ax = anchor ? pct(anchor.x) / 100 : 0.5;
  const ay = anchor ? pct(anchor.y) / 100 : 0.5;
  const preset: View = { k: presetK, cx: (0.5 - ax * (1 - presetK)) / presetK, cy: (0.5 - ay * (1 - presetK)) / presetK };
  const [user, setUser] = useState<View | null>(null);
  const userRef = useRef<View | null>(null);
  userRef.current = user;
  const presetRef = useRef(preset);
  presetRef.current = preset;
  useEffect(() => setUser(null), [magnify, patch]);
  const v = user ?? preset;
  const scale = v.k;
  const fracToPix = (fx: number, fy: number): Pt => ({
    x: (v.cx + (fx - 0.5) / v.k) * size - 0.5,
    y: (v.cy + (fy - 0.5) / v.k) * size - 0.5,
  });
  const pixToFrac = (x: number, y: number) => ({
    fx: 0.5 + (((x + 0.5) / size) - v.cx) * v.k,
    fy: 0.5 + (((y + 0.5) / size) - v.cy) * v.k,
  });

  const zoomAt = (fx: number, fy: number, factor: number) => {
    const cur = userRef.current ?? presetRef.current;
    const k = Math.min(MAX_ZOOM, Math.max(1, cur.k * factor));
    // keep the image point under (fx, fy) fixed
    const px = cur.cx + (fx - 0.5) / cur.k, py = cur.cy + (fy - 0.5) / cur.k;
    setUser(clampView({ k, cx: px - (fx - 0.5) / k, cy: py - (fy - 0.5) / k }));
  };
  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;

  // Only a picture that can be zoomed takes the mouse wheel; the small ones on the landing page and the board must let the page scroll.
  const interactive = chrome || !!onTap;
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !interactive) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAtRef.current((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0018)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [interactive]);

  /** Keyboard on the picture: + and − zoom, 0 resets, the arrow keys move a zoomed picture (at 1x they keep stepping through visits). */
  function onKeys(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const cur = userRef.current ?? presetRef.current;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(0.5, 0.5, 1.5); }
    else if (e.key === '-' || e.key === '_' || e.key === '−') { e.preventDefault(); zoomAt(0.5, 0.5, 1 / 1.5); }
    else if (e.key === '0') { e.preventDefault(); setUser({ k: 1, cx: 0.5, cy: 0.5 }); }
    else if (cur.k > 1 && e.key.startsWith('Arrow')) {
      e.preventDefault();
      e.stopPropagation();
      const step = 0.15 / cur.k;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      setUser(clampView({ k: cur.k, cx: cur.cx + dx, cy: cur.cy + dy }));
    }
  }

  const dragged = useRef(false);
  function startDrag(e: React.PointerEvent<HTMLElement>) {
    if (e.button !== 0) return;
    dragged.current = false;
    const r = e.currentTarget.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, v: userRef.current ?? presetRef.current };
    if (start.v.k <= 1) return;
    const move = (m: PointerEvent) => {
      const dx = m.clientX - start.x, dy = m.clientY - start.y;
      if (!dragged.current && Math.hypot(dx, dy) < 5) return;
      dragged.current = true;
      setUser(clampView({ k: start.v.k, cx: start.v.cx - dx / r.width / start.v.k, cy: start.v.cy - dy / r.height / start.v.k }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      // the click that follows a drag must not place a mark
      setTimeout(() => { dragged.current = false; }, 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (!onTap || dragged.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (e.detail === 0) {
      onTap({ x: (size - 1) / 2, y: (size - 1) / 2 });
      return;
    }
    onTap(fracToPix((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height));
  }

  function handleMove(e: React.PointerEvent<HTMLElement>) {
    if (!chrome) return;
    const r = e.currentTarget.getBoundingClientRect();
    setCursor(fracToPix((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height));
  }

  const ticks = [0.1, 0.3, 0.5, 0.7, 0.9];
  const readout = (() => {
    if (!cursor || cursor.x < -0.5 || cursor.y < -0.5 || cursor.x > size - 0.5 || cursor.y > size - 0.5) return null;
    const s = pixelToSky(patch, cursor.x, cursor.y);
    const ix = Math.min(size - 1, Math.max(0, Math.round(cursor.x)));
    const iy = Math.min(size - 1, Math.max(0, Math.round(cursor.y)));
    const k = iy * size + ix;
    const noData = !!patch.nodata?.[epoch]?.[band]?.[k] || (mode === 'diff' && !!patch.nodata?.[refEpoch]?.[band]?.[k]);
    const v = mode === 'diff' ? bandFrames[epoch][k] - bandFrames[refEpoch][k] : bandFrames[epoch][k];
    const nz = mode === 'diff' ? Math.hypot(patch.noise[epoch][band], patch.noise[refEpoch][band]) : patch.noise[epoch][band];
    const share = patch.flagShare?.[epoch]?.[band]?.[k];
    let text: string;
    if (noData) text = t('canvas.noData');
    else if (physical && patch.noiseRefMJySr) text = `${formatMJySr(v * patch.noiseRefMJySr)} ± ${formatMJySr(nz * patch.noiseRefMJySr, true)} MJy/sr`;
    else text = `${v >= 0 ? '+' : '−'}${num(Math.abs(v), 1)} σ`;
    const flagged = share !== undefined ? share >= 51 : !!patch.flags[epoch][band][k];
    return { ra: formatRa(s.ra), dec: formatDec(s.dec), text, flagged, share: noData ? undefined : share };
  })();

  // Scale bar: the longest "nice" length that takes at most a third of the picture width.
  const shownArcsec = (size * patch.pixelScale) / scale;
  const bar = [...NICE_ARCSEC].reverse().find((a) => a / shownArcsec <= 0.3) ?? NICE_ARCSEC[0];

  const labels = useMemo(() => {
    if (!box.w) return [];
    const items = rings.filter((r) => r.label).map((r) => {
      const f = pixToFrac(r.x, r.y);
      const rr = (((r.r ?? 2.2) * scale) / size) * box.w;
      return { x: f.fx * box.w, y: f.fy * box.h, r: rr, text: r.label as string, color: r.color };
    });
    const placed = placeLabels(items, box.w, box.h);
    return placed.map((p) => ({ ...p, color: items.find((i) => i.text === p.text)?.color ?? '#fff' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rings, box.w, box.h, scale, v.cx, v.cy, size]);

  const view = (
    <div
      ref={boxRef}
      className={`sky ${chrome ? 'sky-chrome' : ''} ${className}`}
      style={scale > 1 ? { touchAction: 'none' } : undefined}
      onPointerMove={handleMove}
      onPointerDown={startDrag}
      onPointerLeave={() => setCursor(null)}
    >
      <div className="sky-zoom" style={{ transform: `translate(${(0.5 - v.cx * v.k) * 100}%, ${(0.5 - v.cy * v.k) * 100}%) scale(${v.k})`, transformOrigin: '0 0' }}>
        <canvas
          ref={ref}
          width={size}
          height={size}
          className={`sky-canvas${smooth ? ' smooth' : ''}`}
          style={brightness !== 1 || contrast !== 1 ? { filter: `brightness(${brightness}) contrast(${contrast})` } : undefined}
        />
        {grid && <div className="sky-grid" style={{ backgroundSize: `${100 / size}% ${100 / size}%` }} />}
        {arrows.length > 0 && (
          <svg className="sky-svg" viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="none" aria-hidden="true">
            {arrows.map((a, i) => {
              const x0 = a.x + 0.5, y0 = a.y + 0.5, x1 = x0 + a.dx, y1 = y0 + a.dy;
              const len = Math.hypot(a.dx, a.dy) || 1;
              const ux = a.dx / len, uy = a.dy / len, h = Math.min(len * 0.4, size / 45);
              return (
                <g key={i} className="sky-arrow" stroke={a.color} strokeWidth={size / 260} fill="none" opacity={a.muted ? 0.4 : 1}>
                  <line x1={x0} y1={y0} x2={x1} y2={y1} />
                  <path d={`M${x1 - ux * h - uy * h * 0.5} ${y1 - uy * h + ux * h * 0.5}L${x1} ${y1}L${x1 - ux * h + uy * h * 0.5} ${y1 - uy * h - ux * h * 0.5}`} />
                </g>
              );
            })}
          </svg>
        )}
        {path && path.length > 1 && (
          <svg className="sky-svg" viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="none" aria-hidden="true">
            <polyline
              points={path.map((p) => `${p.x + 0.5},${p.y + 0.5}`).join(' ')}
              fill="none" stroke={pathColor} strokeWidth={size / 260} strokeDasharray={`${size / 90} ${size / 120}`}
            />
          </svg>
        )}
        {rings.map((ring, i) => {
          const r = ring.r ?? 2.2;
          return (
            <span
              key={i}
              className={`sky-ring${ring.dashed ? ' dashed' : ''}${ring.square ? ' square' : ''}${ring.muted ? ' muted' : ''}`}
              style={{
                left: `${((ring.x + 0.5 - r) / size) * 100}%`,
                top: `${((ring.y + 0.5 - r) / size) * 100}%`,
                width: `${((2 * r) / size) * 100}%`,
                borderColor: ring.color,
              }}
            />
          );
        })}
        {mark && (
          <span
            className="sky-mark"
            style={{ left: `${((mark.x + 0.5 - 2.4) / size) * 100}%`, top: `${((mark.y + 0.5 - 2.4) / size) * 100}%`, width: `${(4.8 / size) * 100}%` }}
          />
        )}
      </div>
      <div className="sky-labels" aria-hidden="true">
        {labels.map((l, i) => (
          <span key={i} className="sky-label" style={{ left: l.left, top: l.top, color: l.color }}>{l.text}</span>
        ))}
      </div>
      {onTap && (
        <button type="button" className="sky-tap" aria-label={tapLabel ?? t('canvas.tap')} aria-describedby={`${keyHelpId}`} aria-keyshortcuts="+ - 0 ArrowLeft ArrowRight ArrowUp ArrowDown" onClick={handleClick} onKeyDown={onKeys} />
      )}
      {onTap && <span id={keyHelpId} className="sr-only">{t('canvas.keyHelp')}</span>}
      {chrome && (
        <>
          <svg className="sky-compass" width="44" height="44" viewBox="0 0 44 44" aria-label={t('canvas.compass')} role="img">
            <g stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round">
              <path d="M22 38V8M20 13l2-5 2 5" />
              <path d="M30 30H8M13 28l-5 2 5 2" />
            </g>
            <text x="22" y="6" textAnchor="middle" fontSize="9" fill="#fff" fontFamily="var(--mono)">N</text>
            <text x="5" y="27" textAnchor="middle" fontSize="9" fill="#fff" fontFamily="var(--mono)">E</text>
          </svg>
          <div className="sky-scale" aria-label={t('canvas.scale', { v: arcLabel(bar) })}>
            <span className="sky-scale-bar" style={{ width: `${(bar / shownArcsec) * 100}%`, minWidth: 8 }} />
            <span>{arcLabel(bar)}</span>
          </div>
          <div className="sky-readout" aria-hidden={!readout}>
            {readout ? (
              <>
                <span>{readout.ra}</span><span>{readout.dec}</span>
                <span>{readout.text}{readout.share !== undefined && physical ? ` · ${t('canvas.flag', { v: Math.round((readout.share / 255) * 100) })}` : readout.flagged ? ` · ${t('canvas.flagged')}` : ''}</span>
              </>
            ) : <span className="muted">{t('canvas.hover')}</span>}
          </div>
        </>
      )}
      {(chrome || onTap) && <div className="sky-zoombar" role="group" aria-label={t('canvas.zoom')} onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={(e) => { e.stopPropagation(); zoomAt(0.5, 0.5, 1.5); }} aria-label={t('canvas.zoomIn')} disabled={scale >= MAX_ZOOM}>+</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); zoomAt(0.5, 0.5, 1 / 1.5); }} aria-label={t('canvas.zoomOut')} disabled={scale <= 1}>−</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); setUser({ k: 1, cx: 0.5, cy: 0.5 }); }} aria-label={t('canvas.zoomReset')} disabled={scale === 1 && !user}>1×</button>
      </div>}
      {children}
    </div>
  );

  if (!chrome) return view;

  return (
    <div className="stage">
      <div className="gut gut-top" aria-hidden="true">
        {ticks.map((t) => {
          const p = fracToPix(t, 0.5);
          return <span key={t} style={{ left: `${t * 100}%` }}>{formatRa(pixelToSky(patch, p.x, p.y).ra)}</span>;
        })}
      </div>
      <div className="gut gut-left" aria-hidden="true">
        {ticks.map((t) => {
          const p = fracToPix(0.5, t);
          return <span key={t} style={{ top: `${t * 100}%` }}>{formatDec(pixelToSky(patch, p.x, p.y).dec)}</span>;
        })}
      </div>
      {view}
    </div>
  );
}
