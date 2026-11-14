import { useMemo } from 'react';
import type { Chip, Outcome, Pt, SkyPatch } from '../data/types';
import type { CaseDef } from '../data/catalog';
import { KNOWN } from '../data/catalog';
import { truthText, type AnswerKey } from '../sky/analysis';
import { useI18n } from '../i18n/react';
import { refNoise, sharedStretch } from '../sky/render';
import { CropView } from '../components/CropView';
import { MeasureCard } from '../components/MeasureCard';
import { measureBest } from '../sky/measure';
import { checkCatalogue } from '../sky/catalogue';
import { useCatalogue } from '../data/useCatalogue';

const CLS: Record<Outcome, string> = { great: 'match', partial: 'partial', miss: 'none' };

interface Props {
  caseDef: CaseDef;
  patch: SkyPatch;
  answer: AnswerKey;
  outcome: Outcome;
  hit: boolean;
  mark: Pt | null;
  chips: Chip[];
  gaveUp: boolean;
  peeked: boolean;
  nextLabel: string;
  onNext: () => void;
  onRetry: () => void;
}

export function Reveal({ caseDef, patch, answer, outcome, hit, mark, chips, gaveUp, peeked, nextLabel, onNext, onRetry }: Props) {
  const { t } = useI18n();
  const copy = gaveUp ? { badge: t('rev.shown.badge'), title: t('rev.shown.title'), token: t('rev.token'), sub: t('rev.shown.sub'), cls: 'none' }
    : peeked ? { badge: t('rev.practice.badge'), title: t(`rev.${outcome}.title`), token: t('rev.token'), sub: t('rev.practice.sub'), cls: 'none' }
      : { badge: t(`rev.${outcome}.badge`), title: t(`rev.${outcome}.title`), token: t(outcome === 'great' ? 'rev.great.token' : 'rev.token'), sub: t(`rev.${outcome}.sub`), cls: CLS[outcome] };
  const b = Math.max(0, patch.bands.findIndex((x) => x.id === answer.bestBand));
  const frames = useMemo(() => patch.frames.map((f) => f[b]), [patch, b]);
  const stretch = useMemo(() => sharedStretch(frames, refNoise(patch.noise, b), 'standard'), [frames, patch, b]);
  const nEp = patch.epochs.length;
  const mid = Math.floor(nEp / 2);
  const measurement = useMemo(() => measureBest(patch, answer.positions[nEp - 1]), [patch, answer, nEp]);
  const catalogue = useCatalogue(patch, true);
  const verdict = useMemo(() => checkCatalogue(patch, measurement, catalogue.sources), [patch, measurement, catalogue.sources]);
  const markLine = gaveUp ? t('rev.mark.gaveUp') : hit ? t('rev.mark.hit') : mark ? t('rev.mark.off') : t('rev.mark.none');
  const callLine = chips.length ? chips.map((c: Chip) => t(`chip.${c}`)).join(', ') : t('rev.call.none');

  return (
    <main className="page">
      <section className="reveal" aria-label={t('rev.result')}>
        <div className="reveal-text card">
          <span className={`tag tag-${copy.cls}`}>{copy.badge}</span>
          <h1 className="t-heading">{copy.title}</h1>
          <p className="t-body c-2">{KNOWN[caseDef.id].fact}</p>
          <dl className="facts">
            <dt>{t('rev.yourMark')}</dt><dd>{markLine}</dd>
            <dt>{t('rev.yourCall')}</dt><dd>{callLine}</dd>
            <dt>{t('rev.known')}</dt><dd>{truthText(answer)}</dd>
          </dl>
          <div className="reveal-token">
            <span className="token" style={{ background: caseDef.color }} aria-hidden="true">{caseDef.n}</span>
            <span><strong>{copy.token}</strong><span className="t-caption c-3">{copy.sub}</span></span>
          </div>
          <div className="row wrap">
            <button type="button" className="btn btn-primary btn-lg" onClick={onNext}>{nextLabel}</button>
            <button type="button" className="btn" onClick={onRetry}>{t('rev.retry')}</button>
          </div>
        </div>
        <div className="reveal-crops card">
          <h2 className="t-label">{t('rev.zoom', { label: patch.bands[b].label })}</h2>
          <div className="crops">
            {patch.epochs.map((ep, e) => (
              <figure key={ep.index} className="crop-fig">
                <CropView
                  data={frames[e]}
                  nodata={patch.nodata?.[e]?.[b]}
                  size={patch.size}
                  center={answer.positions[mid]}
                  half={5}
                  stretch={stretch}
                  tint={patch.bands[b].tint}
                  truth={answer.positions[e]}
                  mark={mark}
                />
                <figcaption className="t-caption c-2">{ep.label}</figcaption>
              </figure>
            ))}
          </div>
          <p className="t-caption c-3">{t('rev.cropNote')}</p>
          <hr className="div" />
          <section aria-label={t('rev.measure')}>
            <h2 className="t-label">{t('rev.measure')}</h2>
            <MeasureCard patch={patch} measurement={measurement} verdict={verdict} catalogue={catalogue} />
          </section>
        </div>
      </section>
    </main>
  );
}
