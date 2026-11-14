import { useMemo } from 'react';
import type { Chip, Outcome, Pt, SkyPatch } from '../data/types';
import type { CaseDef } from '../data/catalog';
import { KNOWN } from '../data/catalog';
import type { AnswerKey } from '../sky/analysis';
import { refNoise, sharedStretch } from '../sky/render';
import { CropView } from '../components/CropView';

const CHIP_NAMES: Record<Chip, string> = { moved: 'Moved', bright: 'Brightness changed', noclear: 'No clear change', unsure: 'Unsure' };

const COPY: Record<Outcome, { badge: string; title: string; token: string; sub: string; cls: string }> = {
  great: { badge: 'Sharp Eye', title: 'Matches the catalog', token: 'Case token + Sharp Eye badge', sub: 'Your mark and your call agree with what astronomers have measured.', cls: 'great' },
  partial: { badge: 'Partly matches', title: 'Partly matches the catalog', token: 'Case token earned', sub: 'One part agrees with the catalog. Retry any time for practice.', cls: 'partial' },
  miss: { badge: 'No match this time', title: 'Doesn’t match the catalog this time', token: 'Case token earned', sub: 'Every case counts. Check the green rings, then try again.', cls: 'miss' },
};

const SHOWN = { badge: 'Shown to you', title: 'Here’s what the catalog says', token: 'Case token earned', sub: 'Now you know what to look for. Try again any time for practice.', cls: 'miss' };

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
  const copy = gaveUp ? SHOWN
    : peeked ? { ...COPY[outcome], badge: 'Practice round', cls: 'miss', token: 'Case token earned', sub: 'You saw the answer first, so this round counts as practice. Retry any time.' }
      : COPY[outcome];
  const b = Math.max(0, patch.bands.findIndex((x) => x.id === answer.bestBand));
  const frames = useMemo(() => patch.frames.map((f) => f[b]), [patch, b]);
  const stretch = useMemo(() => sharedStretch(frames, refNoise(patch.noise, b), 'standard'), [frames, patch, b]);
  const markLine = gaveUp ? 'You asked to be shown' : hit ? 'Right where the catalog puts it' : mark ? 'A little off. The green ring shows where the catalog puts it.' : 'No mark';
  const callLine = chips.length ? chips.map((c) => CHIP_NAMES[c]).join(', ') : 'No answer picked';

  return (
    <main className="page">
      <section className="reveal" aria-label="Result">
        <div className="reveal-text">
          <span className={`badge ${copy.cls}`}>{copy.badge}</span>
          <h1 className="reveal-title">{copy.title}</h1>
          <p className="reveal-fact">{KNOWN[caseDef.id].fact}</p>
          <dl className="reveal-lines">
            <dt>Your mark</dt><dd>{markLine}</dd>
            <dt>Your call</dt><dd>{callLine}</dd>
            <dt>What’s known</dt><dd>{answer.truth}</dd>
          </dl>
          <div className="reveal-token">
            <svg width="54" height="54" viewBox="0 0 54 54" aria-hidden="true">
              <circle cx="27" cy="27" r="24" fill={caseDef.color} />
              <circle cx="27" cy="27" r="17" fill="none" stroke="#16133F" strokeWidth="2" strokeDasharray="3 3" />
              <text x="27" y="34" textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontSize="20" fontWeight="700" fill="#16133F">{caseDef.n}</text>
            </svg>
            <span><strong>{copy.token}</strong><span>{copy.sub}</span></span>
          </div>
          <div className="reveal-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={onNext}>{nextLabel}</button>
            <button type="button" className="btn btn-paper" onClick={onRetry}>Try again for practice</button>
          </div>
        </div>
        <div className="reveal-crops">
          <span className="reveal-crops-title">Zoomed in on the answer, photo by photo ({patch.bands[b].label})</span>
          <div className="crops">
            {patch.epochs.map((ep, e) => (
              <figure key={ep.index} className="crop-fig">
                <CropView
                  data={frames[e]}
                  size={patch.size}
                  center={answer.positions[1]}
                  half={5}
                  stretch={stretch}
                  tint={patch.bands[b].tint}
                  truth={answer.positions[e]}
                  mark={mark}
                />
                <figcaption>{ep.label}</figcaption>
              </figure>
            ))}
          </div>
          <span className="reveal-crops-note">Green ring: where the catalog puts the object on each date. Dashed yellow: your mark. Pixels at real size, enlarged.</span>
        </div>
      </section>
    </main>
  );
}
