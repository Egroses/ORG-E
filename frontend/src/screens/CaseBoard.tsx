import type { SkyPatch, TargetId } from '../data/types';
import { CASES, KNOWN } from '../data/catalog';
import { SkyCanvas } from '../components/SkyCanvas';
import { Icon } from '../components/Icon';
import type { Progress } from '../state/progress';
import { ResetProgress } from '../components/ResetProgress';
import { num } from '../i18n';
import { useI18n } from '../i18n/react';

interface Props {
  results: Progress['results'];
  patches: Partial<Record<TargetId, SkyPatch>>;
  onOpen: (id: TargetId) => void;
  onExplore: () => void;
  onReset: () => void;
}


export function CaseBoard({ results, patches, onOpen, onExplore, onReset }: Props) {
  const { t, tp } = useI18n();
  const next = CASES.find((c) => !results[c.id]);
  return (
    <main className="page">
      <div className="page-head">
        <h1 className="t-heading">{t('board.title')}</h1>
        <p className="t-lead c-2">{t('board.lead')}</p>
      </div>
      <div className="cards5 board">
        {CASES.map((c) => {
          const patch = patches[c.id];
          const obj = KNOWN[c.id];
          const best = patch ? patch.bands.reduce((bi, b, i) => (obj.snr[b.id] > obj.snr[patch.bands[bi].id] ? i : bi), 0) : 0;
          const r = results[c.id];
          const suggested = next?.id === c.id;
          return (
            <button key={c.id} type="button" className={`card case-card${suggested ? ' suggested' : ''}`} onClick={() => onOpen(c.id)}>
              <span className="case-thumb">
                {patch ? <SkyCanvas patch={patch} epoch={Math.min(1, patch.epochs.length - 1)} band={best} /> : <span className="sky sky-loading" />}
              </span>
              <span className="row between">
                <span className="case-chip" style={{ '--c': c.color } as React.CSSProperties}>{t('case.n', { n: c.n })}</span>
                {suggested && <span className="tag">{t('board.next')}</span>}
                {r && <span className="tag tag-match"><Icon name="check" size={12} />{t(`result.${r}`)}</span>}
              </span>
              <strong className="t-title">{c.nick}</strong>
              <span className="t-body c-2">{c.mission}</span>
              <span className="meta">
                <span className="t-caption c-3">{t(`tool.${c.tool}`)}</span>
                <span className="dots" role="img" aria-label={t('board.difficulty', { n: c.difficulty })}>
                  {[1, 2, 3].map((d) => <i key={d} style={d <= c.difficulty ? { background: c.color, borderColor: c.color } : undefined} />)}
                </span>
              </span>
              {patch && (
                <span className="t-caption c-3 mono">
                  {tp('board.visits', patch.epochs.length)} · {tp('map.exposures', patch.imageCounts ? patch.imageCounts.flat().reduce((s, n) => s + n, 0) : patch.epochs.reduce((s, e) => s + e.imageCount, 0))} · {t('board.field', { v: num(patch.fovDeg * 60, 0) })}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="banner card">
        <div>
          <strong>{t('board.ready')}</strong>
          <span className="t-body c-2">{t('board.readyLead')}</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={onExplore}>{t('board.explore')}</button>
      </div>
      <ResetProgress finished={CASES.filter((c) => results[c.id]).length} onReset={onReset} />
    </main>
  );
}
