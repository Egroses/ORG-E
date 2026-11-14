import type { SkyPatch } from '../../data/types';
import { mjdToDateText } from '../../lib/format';
import { R } from '../../ui/realisticText';
import { num } from '../../i18n';
import { useI18n } from '../../i18n/react';

interface Props {
  patch: SkyPatch;
  epoch: number;
  band: number;
  onPick: (epoch: number, band: number) => void;
  onBand: (band: number) => void;
  /** Visits included in the stack (Stack mode shows the check boxes). */
  stack: number[];
  showStack: boolean;
  onToggleStack: (epoch: number) => void;
}

const range = (b: { rangeUm: [number, number] }) => `${num(b.rangeUm[0], 2)}–${num(b.rangeUm[1], 2)} µm`;

/** Bands × visits as a real table: holes stay holes, up to 16 visits scroll sideways with compact headers. */
export function VisitGrid({ patch, epoch, band, onPick, onBand, stack, showStack, onToggleStack }: Props) {
  const { t, tp } = useI18n();
  const n = patch.epochs.length;
  const compact = n > 5;
  return (
    <div className="map vgrid-wrap">
      <div className="row between">
        <h2 className="t-label">{R.mapTitle}</h2>
        <span className="t-caption c-3">{R.mapSub}</span>
      </div>
      <div className="vgrid-scroll" tabIndex={0} role="region" aria-label={R.mapTitle}>
        <table className={`vgrid${compact ? ' compact' : ''}`}>
          <thead>
            <tr>
              <th scope="col" className="vg-corner"><span className="sr-only">{R.legendTitle}</span></th>
              {patch.epochs.map((ep, e) => (
                <th key={ep.index} scope="col" className={e === epoch ? 'on' : ''} title={`${ep.label}: ${ep.dates}`}>
                  {compact ? `V${e + 1}` : ep.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {patch.bands.map((bd, b) => (
              <tr key={bd.id}>
                <th scope="row" className={b === band ? 'on' : ''}>
                  <button type="button" onClick={() => onBand(b)} aria-pressed={b === band} title={`${bd.id}, ${range(bd)}`}>
                    <i className="swatch" style={{ background: bd.color }} aria-hidden="true" />{bd.id}
                  </button>
                </th>
                {patch.epochs.map((ep, e) => {
                  const none = !!patch.missing?.[e]?.[b];
                  const count = patch.imageCounts?.[e]?.[b];
                  const on = e === epoch && b === band;
                  return (
                    <td key={ep.index}>
                      <button
                        type="button"
                        className={`vg-cell${on ? ' on' : ''}${none ? ' none' : ''}`}
                        aria-pressed={on}
                        disabled={none}
                        title={t('r.mapCell', { id: bd.id, label: ep.label, what: none ? R.mapNoPhoto : count != null ? tp('map.exposures', count) : '?' })}
                        aria-label={t('r.mapCell', { id: bd.id, label: ep.label, what: none ? R.mapNoPhoto : count != null ? tp('map.exposures', count) : t('r.mapCellUnknown') })}
                        onClick={() => onPick(e, b)}
                      >
                        {none ? '' : count ?? '·'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="t-caption c-3">{R.mapHelp}</p>

      <h3 className="t-micro c-3">{R.legendTitle}</h3>
      <ul className="legend">
        {patch.bands.map((bd, b) => (
          <li key={bd.id}>
            <button type="button" className={`legend-row${b === band ? ' on' : ''}`} aria-pressed={b === band} onClick={() => onBand(b)}>
              <i className="swatch" style={{ background: bd.color }} aria-hidden="true" />
              <span><b>{bd.id}</b></span>
              <span className="mono c-2">{range(bd)}</span>
            </button>
          </li>
        ))}
      </ul>

      <h3 className="t-micro c-3">{R.visitsTitle}</h3>
      <div className="visits-scroll">
        <table className="mini visits">
          <thead>
            <tr>
              <th>{R.visitCols.visit}</th><th>{R.visitCols.window}</th><th>{R.visitCols.mid}</th><th className="num">{R.visitCols.exp}</th>
              {showStack && <th>{R.visitCols.stack}</th>}
            </tr>
          </thead>
          <tbody>
            {patch.epochs.map((ep, e) => (
              <tr key={ep.index} className={e === epoch ? 'on' : ''}>
                <td><button type="button" className="btn-link" onClick={() => onPick(e, band)}>{e + 1}</button></td>
                <td>{ep.dates}</td>
                <td>{mjdToDateText(ep.mjd)}</td>
                <td className="num">{ep.imageCount}</td>
                {showStack && (
                  <td>
                    <input
                      type="checkbox"
                      checked={stack.includes(e)}
                      disabled={!!patch.missing?.[e]?.[band]}
                      aria-label={t('r.includeInStack', { n: e + 1 })}
                      onChange={() => onToggleStack(e)}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
