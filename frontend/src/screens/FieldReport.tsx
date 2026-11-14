import { useState } from 'react';
import type { SkyPatch } from '../data/types';
import { CASES } from '../data/catalog';
import { SkyCanvas } from '../components/SkyCanvas';
import type { Progress } from '../state/progress';
import { ResetProgress } from '../components/ResetProgress';

interface Props {
  results: Progress['results'];
  heroPatch: SkyPatch | null;
  onExplore: () => void;
  onReset: () => void;
}

export function FieldReport({ results, heroPatch, onExplore, onReset }: Props) {
  const [copied, setCopied] = useState(false);
  const done = CASES.filter((c) => results[c.id]).length;
  const sharp = CASES.filter((c) => results[c.id] === 'great').length;
  const line = `Sky Quest: ${done} of 5 cases, ${sharp} Sharp Eye badges`;

  async function copy() {
    const strip = CASES.map((c) => (results[c.id] === 'great' ? '●' : results[c.id] ? '◐' : '○')).join(' ');
    try {
      await navigator.clipboard.writeText(`${line}\n${strip}\nSpotting changes in NASA SPHEREx infrared photos.`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="page page-narrow">
      <section className="report" aria-label="Field report">
        <div className="report-sky">
          {heroPatch && <SkyCanvas patch={heroPatch} epoch={2} band={0} />}
          <svg className="report-stamp" width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
            <circle cx="66" cy="66" r="60" fill="none" stroke="#FFC53D" strokeWidth="3" />
            <circle cx="66" cy="66" r="48" fill="none" stroke="#FFC53D" strokeWidth="1.5" />
            <text x="66" y="62" textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontSize="17" fontWeight="600" fill="#FFC53D">SKY QUEST</text>
            <text x="66" y="82" textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontSize="13" fill="#FFC53D">SPHEREx 2026</text>
          </svg>
        </div>
        <div className="report-body">
          <span className="report-kicker">Field report</span>
          <h1 className="report-title">Your infrared field report</h1>
          <p>I practiced spotting changes in real photos from NASA’s SPHEREx telescope.</p>
          <div className="report-strip" role="img" aria-label={`${done} of 5 cases finished, ${sharp} with a Sharp Eye badge`}>
            {CASES.map((c) => {
              const r = results[c.id];
              return (
                <span key={c.id} className="report-slot" style={{ borderColor: r ? c.color : undefined }}>
                  <span className="report-dot" style={{ background: r === 'great' ? c.color : r ? '#C9C5EE' : 'transparent' }} />
                </span>
              );
            })}
          </div>
          <strong>{line}</strong>
          <div className="report-actions">
            <button type="button" className="btn btn-ink" onClick={copy}>{copied ? 'Copied' : 'Copy report'}</button>
          </div>
          <span className="report-note">The report shows how you did, not the answers, so friends can still try it.</span>
        </div>
      </section>
      <div className="banner">
        <div>
          <strong>All tools ready</strong>
          <span>Take them to any patch of sky SPHEREx has photographed.</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={onExplore}>Explore the sky</button>
      </div>
      <ResetProgress finished={done} onReset={onReset} />
    </main>
  );
}
