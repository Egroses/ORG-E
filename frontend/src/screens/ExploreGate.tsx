import { useState } from 'react';
import type { LoadStep } from '../data/types';
import { FOV_OPTIONS } from '../data/catalog';

interface Props {
  initialText?: string;
  initialFov?: number;
  loading: LoadStep | null;
  error?: string | null;
  onSearch: (text: string, fov: number) => string | null;
  onTryCase: () => void;
}

const STEPS: { id: LoadStep; name: string }[] = [
  { id: 'finding', name: 'Finding SPHEREx photos of this spot' },
  { id: 'downloading', name: 'Downloading three dates' },
  { id: 'stacking', name: 'Stacking photos for each date' },
];

export function ExploreGate({ initialText = '', initialFov = 0.1, loading, error, onSearch, onTryCase }: Props) {
  const [text, setText] = useState(initialText);
  const [fov, setFov] = useState(initialFov);
  const [formError, setFormError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(onSearch(text, fov));
  }

  if (loading && loading !== 'done') {
    const idx = STEPS.findIndex((s) => s.id === loading);
    return (
      <main className="page page-narrow">
        <section className="card paper gate">
          <h1 className="gate-title">Preparing your sky patch</h1>
          <ol className="load-steps">
            {STEPS.map((s, i) => (
              <li key={s.id} className={i < idx ? 'done' : i === idx ? 'now' : ''}>
                <span className="load-dot" aria-hidden="true" />
                {s.name}
                {i < idx && <span className="sr-only"> (done)</span>}
                {i === idx && <span className="sr-only"> (in progress)</span>}
              </li>
            ))}
          </ol>
          <p className="gate-note">With live SPHEREx data this can take about 90 seconds. The five practice cases are ready instantly.</p>
          <button type="button" className="btn btn-paper" onClick={onTryCase}>Try a practice case while you wait</button>
        </section>
      </main>
    );
  }

  return (
    <main className="page page-narrow">
      <form className="card paper gate" onSubmit={submit}>
        <h1 className="gate-title">Explore the sky</h1>
        <p className="gate-lead">Type a star name or a position. We’ll fetch SPHEREx photos of that spot from three dates and flip them for you.</p>
        <label htmlFor="where" className="gate-label">Where to look</label>
        <input
          id="where"
          type="text"
          value={text}
          onChange={(e) => { setText(e.target.value); setFormError(null); }}
          placeholder="e.g. WISE 0855, or 08h55m10s −07°14′42″, or 133.79 -7.24"
          aria-describedby={formError || error ? 'gate-error' : undefined}
        />
        <span className="gate-label" id="fov-label">How much sky</span>
        <div className="seg seg-paper" role="radiogroup" aria-labelledby="fov-label">
          {FOV_OPTIONS.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={fov === o.value} className={`seg-btn${fov === o.value ? ' on' : ''}`} onClick={() => setFov(o.value)}>
              {o.name} <span className="seg-sub">{o.sub}</span>
            </button>
          ))}
        </div>
        <p className="gate-note">Bigger areas catch faster movers but take longer to load.</p>
        {(formError || error) && <p id="gate-error" className="form-error" role="alert">{formError || error}</p>}
        <button type="submit" className="btn btn-primary btn-lg">Show this sky</button>
      </form>
    </main>
  );
}
