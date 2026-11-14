import { formatCoords } from '../sky/astro';
import { candidatesToCsv, candidateVerdict, type Candidate } from '../state/progress';
import { num } from '../i18n';
import { useI18n } from '../i18n/react';

interface Props {
  candidates: Candidate[];
  onRemove: (id: string) => void;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** The discovery notebook: spots no catalogue explained, kept in this browser only. */
export function Notebook({ candidates, onRemove }: Props) {
  const { t } = useI18n();
  return (
    <section className="card notebook" aria-label={t('nb.label')}>
      <div className="notebook-head">
        <div>
          <h2 className="t-title">{t('nb.title')}</h2>
          <p className="t-body c-2">{t('nb.lead')}</p>
        </div>
        <button
          type="button"
          className="btn btn-sm"
          disabled={!candidates.length}
          onClick={() => download('sky-quest-candidates.csv', candidatesToCsv(candidates))}
        >
          {t('nb.csv')}
        </button>
      </div>
      {candidates.length === 0 ? (
        <p className="empty">{t('nb.empty')}</p>
      ) : (
        <ul className="cands">
          {candidates.map((c, i) => (
            <li key={c.id}>
              <span className="cand-n">{i + 1}</span>
              <span className="cand-body">
                <strong>{formatCoords(c.ra, c.dec)}</strong>
                <span>
                  {c.shiftArcsec !== null ? t(c.rateArcsecPerYear !== null ? 'nb.shiftRate' : 'nb.shift', { shift: num(c.shiftArcsec, 1), rate: c.rateArcsecPerYear !== null ? num(c.rateArcsecPerYear, 1) : '' }) : t('nb.notMeasured')}
                  {' · '}{c.band}
                </span>
                <span className="c-3">{candidateVerdict(c)}</span>
              </span>
              <button type="button" className="btn-link" onClick={() => onRemove(c.id)} aria-label={t('nb.removeN', { n: i + 1 })}>{t('nb.remove')}</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
