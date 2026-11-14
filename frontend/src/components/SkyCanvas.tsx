import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { CompareMode, Detail, Pt, SkyPatch } from '../data/types';
import { mean, paintDiff, paintImage, refNoise, sharedStretch, subtract } from '../sky/render';

export interface Ring {
  x: number;
  y: number;
  color: string;
  /** Radius in image pixels. */
  r?: number;
  label?: string;
  dashed?: boolean;
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
  mark?: Pt | null;
  rings?: Ring[];
  path?: Pt[];
  pathColor?: string;
  /** Point the magnifier zooms around. Defaults to the mark, then the centre. */
  focus?: Pt | null;
  onTap?: (p: Pt) => void;
  tapLabel?: string;
  className?: string;
  children?: ReactNode;
}

const ZOOM = 2.5;

export function SkyCanvas({
  patch, epoch, band, mode = 'blink', detail = 'standard', invert = false, magnify = false, grid = false,
  mark = null, rings = [], path, pathColor = '#CFCBF2', focus = null, onTap, tapLabel, className = '', children,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = patch.size;
  const bandFrames = useMemo(() => patch.frames.map((f) => f[band]), [patch, band]);
  const noiseRef = refNoise(patch.noise, band);
  const stretch = useMemo(() => sharedStretch(bandFrames, noiseRef, detail), [bandFrames, noiseRef, detail]);
  const stack = useMemo(() => (mode === 'stack' ? mean(bandFrames) : null), [bandFrames, mode]);
  const stackStretch = useMemo(
    () => (stack ? sharedStretch([stack], noiseRef * 0.6, detail) : null),
    [stack, noiseRef, detail],
  );

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(size, size);
    if (mode === 'diff') {
      const d = subtract(bandFrames[epoch], bandFrames[0]);
      paintDiff(img, d, 6 * Math.max(patch.noise[epoch][band], patch.noise[0][band]));
    } else if (mode === 'stack' && stack && stackStretch) {
      paintImage(img, stack, stackStretch, patch.bands[band].tint, invert);
    } else {
      paintImage(img, bandFrames[epoch], stretch, patch.bands[band].tint, invert);
    }
    ctx.putImageData(img, 0, 0);
  }, [bandFrames, epoch, band, mode, stretch, stack, stackStretch, invert, patch, size]);

  const pct = (v: number) => ((v + 0.5) / size) * 100;
  const scale = magnify ? ZOOM : 1;
  const anchor = focus ?? mark;
  const origin = anchor ? { x: pct(anchor.x), y: pct(anchor.y) } : { x: 50, y: 50 };

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (!onTap) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (e.detail === 0) {
      // keyboard activation: mark the centre of the image
      onTap({ x: (size - 1) / 2, y: (size - 1) / 2 });
      return;
    }
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    const ox = origin.x / 100, oy = origin.y / 100;
    const cx = ox + (fx - ox) / scale;
    const cy = oy + (fy - oy) / scale;
    onTap({ x: cx * size - 0.5, y: cy * size - 0.5 });
  }

  return (
    <div className={`sky ${className}`}>
      <div className="sky-zoom" style={{ transform: `scale(${scale})`, transformOrigin: `${origin.x}% ${origin.y}%` }}>
        <canvas ref={ref} width={size} height={size} className="sky-canvas" />
        {grid && <div className="sky-grid" style={{ backgroundSize: `${100 / size}% ${100 / size}%` }} />}
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
              className={`sky-ring${ring.dashed ? ' dashed' : ''}`}
              style={{
                left: `${((ring.x + 0.5 - r) / size) * 100}%`,
                top: `${((ring.y + 0.5 - r) / size) * 100}%`,
                width: `${((2 * r) / size) * 100}%`,
                borderColor: ring.color,
              }}
            >
              {ring.label && (
                <span className="sky-ring-label" style={{ color: ring.color, transform: `scale(${1 / scale})` }}>{ring.label}</span>
              )}
            </span>
          );
        })}
        {mark && (
          <span
            className="sky-mark"
            style={{ left: `${((mark.x + 0.5 - 2.4) / size) * 100}%`, top: `${((mark.y + 0.5 - 2.4) / size) * 100}%`, width: `${(4.8 / size) * 100}%` }}
          />
        )}
      </div>
      {onTap && <button type="button" className="sky-tap" aria-label={tapLabel ?? 'Sky photo. Tap a spot to mark it.'} onClick={handleClick} />}
      {children}
    </div>
  );
}
