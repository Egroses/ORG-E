import { useEffect, useRef, useState } from 'react';
import { markTourSeen } from '../state/tour';
import { useI18n } from '../i18n/react';

const STEP_IDS = ['tour.s1', 'tour.s2', 'tour.s3', 'tour.s4'] as const;

export function Tour({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const last = i === STEP_IDS.length - 1;
  const done = () => {
    markTourSeen();
    onClose();
  };
  return (
    <div className="modal-back" onClick={done}>
      <div ref={ref} tabIndex={-1} className="modal tour" role="dialog" aria-modal="true" aria-label={t('tour.label')} onClick={(e) => e.stopPropagation()}>
        <p className="t-micro c-3">{t('tour.progress', { i: i + 1, n: STEP_IDS.length })}</p>
        <h2 className="t-title">{t(`${STEP_IDS[i]}.title`)}</h2>
        <p className="t-body c-2">{t(`${STEP_IDS[i]}.body`)}</p>
        <div className="tour-dots" aria-hidden="true">
          {STEP_IDS.map((_, k) => <span key={k} className={k === i ? 'on' : ''} />)}
        </div>
        <div className="tour-actions">
          <button type="button" className="btn-link" onClick={done}>{t('tour.skip')}</button>
          <span className="spacer" />
          {i > 0 && <button type="button" className="btn btn-outline btn-sm" onClick={() => setI(i - 1)}>{t('tour.back')}</button>}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => (last ? done() : setI(i + 1))}>{last ? t('tour.done') : t('tour.next')}</button>
        </div>
      </div>
    </div>
  );
}
