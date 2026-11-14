import type { SkyPatch } from '../data/types';
import type { CatalogueState } from '../data/useCatalogue';
import type { Verdict } from '../sky/catalogue';
import { describeMeasurement, directionText, type Measurement } from '../sky/measure';
import { verdictText } from '../sky/catalogue';
import { num } from '../i18n';
import { useI18n } from '../i18n/react';
import { Icon } from './Icon';
import { Rich } from './Term';

interface Props {
  patch: SkyPatch;
  measurement: Measurement | null;
  /** When given, the catalogue check is shown (Explore and the result page, never during a practice round). */
  verdict?: Verdict | null;
  catalogue?: CatalogueState;
  onSave?: () => void;
  saved?: boolean;
}

const f1 = (v: number) => num(v, Math.abs(v) >= 10 ? 0 : 1);

export function MeasureCard({ patch, measurement, verdict, catalogue, onSave, saved }: Props) {
  const { t, tp, lang } = useI18n();
  if (!measurement) {
    return <p className="empty">{t('mc.empty')}</p>;
  }
  const m = measurement;
  const band = patch.bands[m.band];
  const nSat = m.points.filter((p) => p.saturated).length;
  return (
    <div className="measure">
      <p className="measure-say" aria-live="polite">{describeMeasurement(m)}</p>
      {m.status === 'ok' && (
        <>
          <dl className="stats">
            <div><dt>{t('mc.shift')}</dt><dd>{f1(m.shiftArcsec)}″</dd></div>
            <div><dt>{t('mc.speed')}</dt><dd>{m.rate !== null ? t('mc.perYear', { v: f1(m.rate) }) : '–'}</dd></div>
            <div><dt>{t('mc.uncertainty')}</dt><dd>± {f1(m.errArcsec)}″</dd></div>
          </dl>
          <table className="mini">
            <thead>
              <tr><th>{t('mc.visit')}</th><th>{t('mc.change')}</th><th>{t('mc.signal')}</th></tr>
            </thead>
            <tbody>
              {m.points.map((p) => (
                <tr key={p.epoch}>
                  <td>{patch.epochs[p.epoch].label}</td>
                  <td>{p.epoch === m.points[0].epoch ? t('mc.start') : `${f1(Math.hypot(p.east, p.north))}″ ${directionText(p.east, p.north)}`}</td>
                  <td>{p.snr >= 100 ? t('mc.veryBright') : p.snr >= 20 ? t('mc.clear') : t('mc.faint')}{p.saturated ? ` · ${t('mc.saturated')}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {nSat > 0 && (
            <p className="note warn">
              {t('mc.satNote', { n: nSat, total: m.points.length })}
            </p>
          )}
          <p className="t-caption c-3">
            {t('mc.measuredIn', { band: band.name.toLocaleLowerCase(lang === 'tr' ? 'tr-TR' : 'en-US'), label: band.label })}
            {' '}<Rich text={t('mc.arcsecond')} />
            {m.missing > 0 && ` ${tp('mc.missing', m.missing)}`}
          </p>
        </>
      )}

      {verdict !== undefined && (
        <div className={`verdict ${verdict?.kind ?? ''}`}>
          <h3 className="t-label">
            {t('mc.catCheck')}
            {verdict && <span className={`tag tag-${verdict.kind}`}>{t(`mc.verdict.${verdict.kind}`)}</span>}
          </h3>
          {catalogue?.status === 'loading' && <p className="t-caption c-3"><Rich text={t('mc.lookup')} /></p>}
          {verdict && <p className="t-body">{verdictText(verdict)}</p>}
          {catalogue?.status === 'unavailable' && (
            <p className="t-caption c-3">{t('mc.gaiaDown')}</p>
          )}
          {onSave && verdict?.candidate && m.status === 'ok' && (
            <button type="button" className="btn btn-sm" onClick={onSave} disabled={saved}>
              <Icon name={saved ? 'check' : 'star'} size={14} />{saved ? t('mc.savedNb') : t('mc.save')}
            </button>
          )}
          {verdict?.candidate && <p className="t-caption c-3"><Rich text={t('mc.candNote')} /></p>}
        </div>
      )}
    </div>
  );
}
