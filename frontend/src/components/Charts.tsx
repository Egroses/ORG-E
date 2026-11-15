import type { FluxSeries } from '../sky/photometry';
import { fluxChartLayout, spectrumChartLayout, tickAnchor, type ChartLayout, type SpectrumPoint } from '../sky/charts';
import { useI18n } from '../i18n/react';

// Two small SVG charts. They draw measurements only: no fitted curve, no model.

function Frame({ layout, xTitle, yTitle }: { layout: ChartLayout; xTitle: string; yTitle: string }) {
  const { box } = layout;
  return (
    <g className="chart-axes">
      <rect x={box.left} y={box.top} width={box.w - box.left - box.right} height={box.h - box.top - box.bottom} className="chart-plot" />
      {layout.yTicks.map((t) => (
        <g key={`y${t.y}`}>
          <line x1={box.left} x2={box.w - box.right} y1={t.y} y2={t.y} className="chart-grid" />
          <text x={box.left - 5} y={t.y + 3.5} textAnchor="end">{t.label}</text>
        </g>
      ))}
      {layout.xTicks.map((t) => (
        <g key={`x${t.x}`}>
          <line x1={t.x} x2={t.x} y1={box.h - box.bottom} y2={box.h - box.bottom + 4} className="chart-tick" />
          <text x={t.x} y={box.h - box.bottom + 15} textAnchor={tickAnchor(t.x, t.label, box.w)}>{t.label}</text>
        </g>
      ))}
      {layout.zeroY !== null && <line x1={box.left} x2={box.w - box.right} y1={layout.zeroY} y2={layout.zeroY} className="chart-zero" />}
      <text x={box.left + 2} y={box.top + 9} className="chart-title">{yTitle}</text>
      <text x={box.w - box.right} y={box.h - 3} textAnchor="end" className="chart-title">{xTitle}</text>
    </g>
  );
}

function Dots({ layout, colors, arrows }: { layout: ChartLayout; colors: string[]; arrows: boolean }) {
  return (
    <g>
      {layout.markers.map((m) => {
        const c = colors[m.series] ?? 'currentColor';
        return (
          <g key={`${m.series}-${m.index}`}>
            <title>{m.label}</title>
            <line x1={m.cx} x2={m.cx} y1={m.y0} y2={m.y1} stroke={c} strokeWidth="1.4" />
            <line x1={m.cx - 3} x2={m.cx + 3} y1={m.y0} y2={m.y0} stroke={c} strokeWidth="1.4" />
            <line x1={m.cx - 3} x2={m.cx + 3} y1={m.y1} y2={m.y1} stroke={c} strokeWidth="1.4" />
            <circle cx={m.cx} cy={m.cy} r="3.6" fill={m.hollow ? 'var(--surface)' : c} stroke={c} strokeWidth="1.6" />
            {m.hollow && arrows && <path d={`M${m.cx} ${m.cy - 5.5}l-2.6 -3.6M${m.cx} ${m.cy - 5.5}l2.6 -3.6`} stroke={c} strokeWidth="1.4" fill="none" />}
          </g>
        );
      })}
    </g>
  );
}

/** Flux (mJy) of the marked source versus date, one colour per band. Hollow markers with an arrow are lower limits. */
export function FluxChart({ series, label }: { series: FluxSeries[]; label: string }) {
  const { t } = useI18n();
  const layout = fluxChartLayout(series);
  const { box } = layout;
  const used = series.filter((s) => s.points.length);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${box.w} ${box.h}`} role="img" aria-label={label} className="chart-svg">
        <Frame layout={layout} xTitle={t('chart.date')} yTitle={t('chart.fluxMJy')} />
        {layout.lines.map((l) => (
          <polyline key={l.series} points={l.points.map((p) => p.join(',')).join(' ')} fill="none" stroke={series[l.series].color} strokeWidth="1.2" strokeOpacity="0.55" />
        ))}
        <Dots layout={layout} colors={series.map((s) => s.color)} arrows />
      </svg>
      <figcaption className="chart-legend">
        {used.map((s) => <span key={s.bandId}><i style={{ background: s.color }} />{s.bandId}</span>)}
      </figcaption>
    </figure>
  );
}

/** Flux (mJy) versus wavelength. Hollow markers are flagged points. */
export function SpectrumChart({ points, label }: { points: SpectrumPoint[]; label: string }) {
  const { t } = useI18n();
  const layout = spectrumChartLayout(points);
  const { box } = layout;
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${box.w} ${box.h}`} role="img" aria-label={label} className="chart-svg">
        <Frame layout={layout} xTitle={t('chart.wavelength')} yTitle={t('chart.fluxMJy')} />
        <Dots layout={layout} colors={['var(--accent)']} arrows={false} />
      </svg>
    </figure>
  );
}
