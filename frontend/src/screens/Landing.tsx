import { useEffect, useState } from 'react';
import type { SkyPatch } from '../data/types';
import { SkyCanvas } from '../components/SkyCanvas';
import { Logo } from '../components/TopBar';

interface Props {
  heroPatch: SkyPatch | null;
  onStart: () => void;
  onJump: (text: string) => string | null;
  onExplore: () => void;
}

export function Landing({ heroPatch, onStart, onJump, onExplore }: Props) {
  const [epoch, setEpoch] = useState(0);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setEpoch((e) => (e + 1) % 3), 900);
    return () => window.clearInterval(id);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(onJump(text));
  }

  return (
    <div className="landing">
      <header className="landing-top">
        <span className="brand"><Logo size={34} />Sky Quest</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={onExplore}>Explore the sky</button>
      </header>

      <div className="hero">
        <div className="hero-text">
          <span className="pill">Real infrared photos from NASA’s SPHEREx telescope</span>
          <h1 className="hero-title">Something changed. Can you catch it?</h1>
          <p className="hero-lead">
            SPHEREx photographs the whole sky every six months. Flip through three photos of the same patch and find the dot
            that moved or changed its glow.
          </p>
          <div className="hero-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={onStart}>Find your first mover</button>
          </div>
          <form className="jump" onSubmit={submit}>
            <label htmlFor="jump">Or jump to any spot in the sky</label>
            <div className="jump-row">
              <input
                id="jump"
                type="text"
                value={text}
                onChange={(e) => { setText(e.target.value); setError(null); }}
                placeholder="Star name or RA, Dec (e.g. 08h55m10s −07°14′42″)"
                aria-describedby={error ? 'jump-error' : undefined}
              />
              <button type="submit" className="btn btn-paper">Go</button>
            </div>
            {error && <p id="jump-error" className="form-error" role="alert">{error}</p>}
          </form>
          <p className="hero-note">Five practice cases with known objects. Nobody here claims a planet discovery.</p>
        </div>

        <div className="hero-sky" aria-hidden="true">
          <span className="hero-page hero-page-a" />
          <span className="hero-page hero-page-b" />
          {heroPatch ? (
            <SkyCanvas className="hero-canvas" patch={heroPatch} epoch={epoch} band={0}>
              <span className="sky-chip sky-chip-left">Photo {epoch + 1} of 3, {heroPatch.epochs[epoch].label}</span>
            </SkyCanvas>
          ) : (
            <div className="hero-canvas sky sky-loading" />
          )}
          <span className="hero-sticker">Tap what changed</span>
        </div>
      </div>

      <ol className="steps">
        <li className="step">
          <span className="step-n" style={{ background: '#6CB8FF', color: '#0B1A33' }}>1</span>
          <span><strong>Watch the flip</strong><span>Three photos of the same patch, about six months apart.</span></span>
        </li>
        <li className="step">
          <span className="step-n" style={{ background: '#FFC53D', color: '#2A1E00' }}>2</span>
          <span><strong>Tap what changed</strong><span>Mark the dot, then say what it did.</span></span>
        </li>
        <li className="step">
          <span className="step-n" style={{ background: '#3DDC97', color: '#062A1B' }}>3</span>
          <span><strong>Check the catalog</strong><span>Compare your call with what astronomers already know.</span></span>
        </li>
      </ol>
    </div>
  );
}
