import type { SkyPatch, TargetId } from '../data/types';
import { CASES, KNOWN } from '../data/catalog';
import { SkyCanvas } from '../components/SkyCanvas';
import type { Progress } from '../state/progress';
import { ResetProgress } from '../components/ResetProgress';

interface Props {
  results: Progress['results'];
  patches: Partial<Record<TargetId, SkyPatch>>;
  onOpen: (id: TargetId) => void;
  onExplore: () => void;
  onReset: () => void;
}

const TOOL_LINE = { flip: 'Tool: flip and step', goggles: 'Tool: infrared goggles', detail: 'Tool: magnifier and grid', compare: 'Tool: changes only' } as const;

export function CaseBoard({ results, patches, onOpen, onExplore, onReset }: Props) {
  const next = CASES.find((c) => !results[c.id]);
  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Your cases</h1>
        <p className="page-lead">Five practice cases with known answers. Take them in any order; each one introduces a new tool.</p>
      </div>
      <div className="tiles">
        {CASES.map((c) => {
          const patch = patches[c.id];
          const obj = KNOWN[c.id];
          const best = patch ? patch.bands.reduce((bi, b, i) => (obj.snr[b.id] > obj.snr[patch.bands[bi].id] ? i : bi), 0) : 0;
          const done = !!results[c.id];
          const suggested = next?.id === c.id;
          return (
            <button key={c.id} type="button" className={`tile${suggested ? ' suggested' : ''}`} onClick={() => onOpen(c.id)}>
              <span className="tile-thumb">
                {patch ? <SkyCanvas patch={patch} epoch={1} band={best} /> : <span className="sky sky-loading" />}
                <span className="tile-case" style={{ background: c.color }}>Case {c.n}</span>
                {suggested && <span className="tile-flag">Up next</span>}
                {done && (
                  <span className="tile-flag done">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
                    Token earned
                  </span>
                )}
              </span>
              <span className="tile-body">
                <span className="tile-nick">{c.nick}</span>
                <span className="tile-mission">{c.mission}</span>
                <span className="tile-meta">
                  <span>{TOOL_LINE[c.tool]}</span>
                  <span className="dots" aria-label={`Difficulty ${c.difficulty} of 3`}>
                    {[1, 2, 3].map((d) => <span key={d} className="dot" style={{ background: d <= c.difficulty ? c.color : undefined }} />)}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="banner">
        <div>
          <strong>Ready for the real sky?</strong>
          <span>Explore any patch SPHEREx has photographed with every tool. What you mark there is saved as an unverified observation, not a discovery.</span>
        </div>
        <button type="button" className="btn btn-outline" onClick={onExplore}>Explore the sky</button>
      </div>
      <ResetProgress finished={CASES.filter((c) => results[c.id]).length} onReset={onReset} />
    </main>
  );
}
