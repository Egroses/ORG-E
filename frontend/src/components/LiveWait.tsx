import { useEffect, useState } from 'react';
import type { LiveProgress } from '../data/types';
import { useI18n } from '../i18n/react';
import { elapsedText, percentDone } from '../lib/liveFormat';
import './live-wait.css';

/** Shown while a position that is not in the saved set is downloaded: real progress, elapsed time, plain words. */
export function LiveWait({ live }: { live: LiveProgress }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const pct = percentDone(live);
  return (
    <div className="live-wait">
      <p className="t-body">{t('live.notice')}</p>
      <div
        className={`live-bar${pct === null ? ' indeterminate' : ''}`}
        role="progressbar"
        aria-label={t('live.barLabel')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        aria-valuetext={pct === null ? t('live.counting') : t('live.bar', { done: live.done, total: live.total })}
      >
        <i style={pct === null ? undefined : { width: `${pct}%` }} />
      </div>
      <p className="t-caption c-2 live-line">
        <span>{pct === null ? t('live.counting') : t('live.bar', { done: live.done, total: live.total })}{pct === null ? '' : ` (${pct}%)`}</span>
        {live.detectorDone !== undefined && live.detectorTotal !== undefined && (
          <span>{t('live.detector', { n: Math.min(live.detectorDone + 1, live.detectorTotal), m: live.detectorTotal })}</span>
        )}
        <span>{t('live.elapsed', { time: elapsedText((now - live.startedAt) / 1000) })}</span>
      </p>
      {live.failed > 0 && <p className="t-caption c-3">{t('live.failed', { n: live.failed })}</p>}
    </div>
  );
}
