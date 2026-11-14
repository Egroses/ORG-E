import type { ReactNode } from 'react';
import { CASES } from '../data/catalog';
import type { Progress } from '../state/progress';

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <rect x="2" y="2" width="30" height="30" rx="10" fill="#2C2770" />
      <circle cx="17" cy="17" r="8.5" fill="none" stroke="#FFC53D" strokeWidth="2.5" />
      <circle cx="19" cy="15" r="2.6" fill="#F4F2FF" />
      <circle cx="11" cy="23" r="1.4" fill="#B9B4E6" />
    </svg>
  );
}

interface Props {
  results: Progress['results'];
  onHome: () => void;
  onExplore: () => void;
  onCases?: () => void;
  center?: ReactNode;
}

export function TopBar({ results, onHome, onExplore, onCases, center }: Props) {
  const done = CASES.filter((c) => results[c.id]).length;
  return (
    <header className="topbar">
      <div className="topbar-side">
        <button type="button" className="brand" onClick={onHome}>
          <Logo />
          Sky Quest
        </button>
        {onCases && (
          <button type="button" className="btn btn-outline btn-sm" onClick={onCases}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            All cases
          </button>
        )}
      </div>
      {center && <div className="topbar-center">{center}</div>}
      <div className="topbar-side">
        <div className="tokens" role="img" aria-label={`${done} of 5 case tokens`}>
          {CASES.map((c) => (
            <span key={c.id} className="token-dot" style={results[c.id] ? { background: c.color, borderColor: c.color } : undefined} />
          ))}
          <span className="tokens-text">{done} of 5</span>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={onExplore}>Explore the sky</button>
      </div>
    </header>
  );
}
