import { useEffect, useMemo, useRef } from 'react';
import type { SkyPatch } from '../data/types';
import { paintImage, refNoise, sharedStretch, type Stretch } from '../sky/render';
import { mjdToDateText } from '../lib/format';
import { Rich } from './Term';
import { num } from '../i18n';
import { useI18n } from '../i18n/react';

// "Which photos do we have?": one row per band, one column per visit.
// Layout idea adapted from YosefGul/spherex-blink (the bands x visits navigator), MIT.

function Thumb({ patch, e, b, stretch }: { patch: SkyPatch; e: number; b: number; stretch: Stretch }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(patch.size, patch.size);
    paintImage(img, patch.frames[e][b], stretch, patch.bands[b].tint, false, patch.nodata?.[e]?.[b]);
    ctx.putImageData(img, 0, 0);
  }, [patch, e, b, stretch]);
  return <canvas ref={ref} width={patch.size} height={patch.size} aria-hidden="true" />;
}

interface Props {
  patch: SkyPatch;
  epoch: number;
  band: number;
  onPick: (epoch: number, band: number) => void;
  onBand: (band: number) => void;
}

export function ObservationMap({ patch, epoch, band, onPick, onBand }: Props) {
  const { t, tp } = useI18n();
  const stretches = useMemo(
    () => patch.bands.map((_, b) => sharedStretch(patch.frames.map((f) => f[b]), refNoise(patch.noise, b), 'standard')),
    [patch],
  );
  const n = patch.epochs.length;
  return (
    <div className="map">
      <div className="row between">
        <h2 className="t-label">{t('map.title')}</h2>
        <span className="t-caption c-3">{t('map.sub')}</span>
      </div>
      <div className={`matrix${n > 4 ? ' dense' : ''}`} role="group" aria-label={t('map.matrix')} style={{ gridTemplateColumns: `58px repeat(${n}, minmax(0, 1fr))` }}>
        <span />
        {patch.epochs.map((ep, e) => (
          <span key={ep.index} className={`mx-head${e === epoch ? ' on' : ''}`} title={ep.dates}>
            {ep.label}
          </span>
        ))}
        {patch.bands.map((bd, b) => (
          <div key={bd.id} className="mx-row">
            <span className={`mx-band${b === band ? ' on' : ''}`}>
              <b>{bd.name}</b>
              <small>{bd.label}</small>
            </span>
            {patch.epochs.map((ep, e) => {
              const missing = !!patch.missing?.[e]?.[b];
              const count = patch.imageCounts?.[e]?.[b];
              const on = e === epoch && b === band;
              return (
                <button
                  key={ep.index}
                  type="button"
                  className={`mx-cell${on ? ' on' : ''}${missing ? ' none' : ''}`}
                  aria-pressed={on}
                  disabled={missing}
                  aria-label={`${t('map.cell', { name: bd.name, label: bd.label, visit: ep.label })}${missing ? `: ${t('map.noExposures')}` : count ? `: ${tp('map.exposures', count)}` : ''}`}
                  onClick={() => onPick(e, b)}
                >
                  {missing ? <span className="mx-no">{t('map.none')}</span> : <Thumb patch={patch} e={e} b={b} stretch={stretches[b]} />}
                  {!missing && count ? <span className="mx-count">{count}</span> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className="t-caption c-3"><Rich text={t('map.help')} /></p>

      <h3 className="t-micro c-3">{t('map.legend')}</h3>
      <ul className="legend">
        {patch.bands.map((bd, b) => (
          <li key={bd.id}>
            <button type="button" className={`legend-row${b === band ? ' on' : ''}`} aria-pressed={b === band} onClick={() => onBand(b)}>
              <i className="swatch" style={{ background: bd.color }} aria-hidden="true" />
              <span><b>{bd.name}</b> <span className="c-3">{bd.id}</span></span>
              <span className="mono c-2">{num(bd.rangeUm[0], 2)}–{num(bd.rangeUm[1], 2)} µm</span>
            </button>
          </li>
        ))}
      </ul>

      <h3 className="t-micro c-3">{t('map.visits')}</h3>
      <table className="mini">
        <thead><tr><th>{t('map.col.visit')}</th><th>{t('map.col.window')}</th><th>{t('map.col.mid')}</th><th className="num">{t('map.col.exp')}</th></tr></thead>
        <tbody>
          {patch.epochs.map((ep, e) => (
            <tr key={ep.index} className={e === epoch ? 'on' : ''}>
              <td>{ep.label}</td>
              <td>{ep.dates}</td>
              <td>{mjdToDateText(ep.mjd)}</td>
              <td className="num">{ep.imageCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
