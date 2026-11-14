import { useState } from 'react';

interface Props {
  /** Number of finished cases; nothing is shown when there is nothing to reset. */
  finished: number;
  onReset: () => void;
}

/** "Start over" with an inline confirmation, since it wipes every case result and badge. */
export function ResetProgress({ finished, onReset }: Props) {
  const [confirming, setConfirming] = useState(false);
  if (finished === 0) return null;

  return (
    <div className="reset" role="group" aria-label="Reset progress">
      {confirming ? (
        <>
          <span className="reset-text">Clear all case tokens and badges? Saved observations stay.</span>
          <span className="reset-actions">
            <button type="button" className="btn btn-sm btn-danger" onClick={() => { setConfirming(false); onReset(); }}>Yes, start over</button>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setConfirming(false)}>Cancel</button>
          </span>
        </>
      ) : (
        <button type="button" className="reset-link" onClick={() => setConfirming(true)}>Start over: reset all cases</button>
      )}
    </div>
  );
}
