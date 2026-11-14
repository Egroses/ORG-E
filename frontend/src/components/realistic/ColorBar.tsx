import { useEffect, useRef } from 'react';
import { rampColor, stretchInverse, type Stretch } from '../../sky/render';
import { formatMJySr } from '../../lib/format';
import { R } from '../../ui/realisticText';
import type { QualityLayer } from '../../state/viewState';
import { num } from '../../i18n';

interface Props {
  stretch: Stretch;
  tint: [number, number, number];
  invert: boolean;
  /** MJy/sr per frame unit; without it the bar is labelled in noise units. */
  noiseRefMJySr?: number;
  quality: QualityLayer;
  /** Difference mode paints a different, signed scale. */
  diff?: boolean;
  /** Full scale of the difference picture, in frame units. */
  diffScale?: number;
  hasNoData: boolean;
}

const TICKS = [0, 0.25, 0.5, 0.75, 1];

/** Colour bar with physical values, plus a legend for no-data pixels and the quality layer. */
export function ColorBar({ stretch, tint, invert, noiseRefMJySr, quality, diff, diffScale = 1, hasNoData }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const w = 256;
    const img = ctx.createImageData(w, 1);
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      let c: [number, number, number];
      if (diff) {
        const v = u * 2 - 1;
        const t = Math.abs(v);
        const target = v >= 0 ? [255, 238, 214] : [94, 234, 212];
        c = [9 + (target[0] - 9) * t, 10 + (target[1] - 10) * t, 13 + (target[2] - 13) * t];
      } else c = rampColor(u, tint, invert);
      img.data.set([c[0], c[1], c[2], 255], x * 4);
    }
    ctx.putImageData(img, 0, 0);
  }, [tint, invert, diff]);

  const unit = noiseRefMJySr ?? 1;
  const labelOf = (v: number) => (noiseRefMJySr ? formatMJySr(v * unit) : num(v, 1));
  const ticks = diff
    ? [-1, -0.5, 0, 0.5, 1].map((t) => ({ pos: (t + 1) / 2, text: labelOf(t * diffScale) }))
    : TICKS.map((u) => ({ pos: u, text: labelOf(stretchInverse(u, stretch)) }));

  return (
    <div className="colorbar" aria-label={noiseRefMJySr ? R.colorbarTitle : R.colorbarNoUnits}>
      <div className="cb-main">
        <span className="t-micro c-3">{noiseRefMJySr ? R.colorbarTitle : R.colorbarNoUnits}</span>
        <canvas ref={ref} width={256} height={1} className="cb-canvas" aria-hidden="true" />
        <div className="cb-ticks" aria-hidden="true">
          {ticks.map((t) => <span key={t.pos} style={{ left: `${t.pos * 100}%` }}>{t.text}</span>)}
        </div>
      </div>
      <div className="cb-keys">
        {hasNoData && <span className="cb-key"><i className="sw-nodata" />{R.noDataLegend}</span>}
        {quality === 'flagshare' && <span className="cb-key"><i className="sw-share" />{R.flagLegend}</span>}
        {quality === 'heavy' && <span className="cb-key"><i className="sw-heavy" />{R.heavyLegend}</span>}
      </div>
    </div>
  );
}
