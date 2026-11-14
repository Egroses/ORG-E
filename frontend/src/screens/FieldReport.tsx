import { useState } from 'react';
import type { SkyPatch } from '../data/types';
import { CASES } from '../data/catalog';
import { SkyCanvas } from '../components/SkyCanvas';
import { Icon } from '../components/Icon';
import type { Progress } from '../state/progress';
import { ResetProgress } from '../components/ResetProgress';
import { Notebook } from '../components/Notebook';
import type { Candidate } from '../state/progress';
import { useI18n } from '../i18n/react';

interface Props {
  results: Progress['results'];
  heroPatch: SkyPatch | null;
  candidates: Candidate[];
  onRemoveCandidate: (id: string) => void;
  onExplore: () => void;
  onReset: () => void;
}

export function FieldReport({ results, heroPatch, candidates, onRemoveCandidate, onExplore, onReset }: Props) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const done = CASES.filter((c) => results[c.id]).length;
  const sharp = CASES.filter((c) => results[c.id] === 'great').length;
  const line = t('rep.line', { done, sharp });

  async function copy() {
    const strip = CASES.map((c) => (results[c.id] === 'great' ? '●' : results[c.id] ? '◐' : '○')).join(' ');
    try {
      await navigator.clipboard.writeText(`${line}\n${strip}\n${t('rep.copyTail')}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="t-heading">{t('rep.title')}</h1>
        <p className="t-lead c-2">{t('rep.lead')}</p>
      </div>
      <section className="report card" aria-label={t('rep.label')}>
        <div className="report-sky">
          {heroPatch && <SkyCanvas patch={heroPatch} epoch={Math.min(2, heroPatch.epochs.length - 1)} band={0} />}
        </div>
        <div className="report-body">
          <span className="t-micro c-3">{t('rep.label')}</span>
          <h2 className="t-title">{t('rep.heading')}</h2>
          <p className="t-body c-2">{t('rep.body')}</p>
          <ul className="report-list">
            {CASES.map((c) => {
              const r = results[c.id];
              return (
                <li key={c.id}>
                  <span className="case-chip" style={{ '--c': c.color } as React.CSSProperties}>{t('case.n', { n: c.n })}</span>
                  <span>{c.nick}</span>
                  <span className={`tag ${r === 'great' ? 'tag-match' : r ? 'tag-partial' : 'line'}`}>{r ? t(`result.${r}`) : t('rep.notPlayed')}</span>
                </li>
              );
            })}
          </ul>
          <strong>{line}</strong>
          <div className="row wrap">
            <button type="button" className="btn btn-primary" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={14} />{copied ? t('rep.copied') : t('rep.copy')}</button>
            <button type="button" className="btn" onClick={onExplore}>{t('board.explore')}</button>
          </div>
          <span className="t-caption c-3">{t('rep.note')}</span>
        </div>
      </section>
      <Notebook candidates={candidates} onRemove={onRemoveCandidate} />
      <ResetProgress finished={done} onReset={onReset} />
    </main>
  );
}
