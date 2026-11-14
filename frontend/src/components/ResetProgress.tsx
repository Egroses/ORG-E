import { useState } from 'react';
import { useI18n } from '../i18n/react';

interface Props {
  /** Number of finished cases; nothing is shown when there is nothing to reset. */
  finished: number;
  onReset: () => void;
}

/** "Start over" with an inline confirmation, since it wipes every case result and badge. */
export function ResetProgress({ finished, onReset }: Props) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  if (finished === 0) return null;

  return (
    <div className="reset" role="group" aria-label={t('reset.group')}>
      {confirming ? (
        <>
          <span className="reset-text">{t('reset.confirm')}</span>
          <span className="reset-actions">
            <button type="button" className="btn btn-sm btn-danger" onClick={() => { setConfirming(false); onReset(); }}>{t('reset.yes')}</button>
            <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)}>{t('reset.cancel')}</button>
          </span>
        </>
      ) : (
        <button type="button" className="reset-link" onClick={() => setConfirming(true)}>{t('reset.link')}</button>
      )}
    </div>
  );
}
