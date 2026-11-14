import { useEffect, useRef } from 'react';
import { GLOSSARY } from '../data/glossary';
import { useI18n } from '../i18n/react';

export function Glossary({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div ref={ref} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-label={t('gloss.title')} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="t-title">{t('gloss.title')}</h2>
          <button type="button" className="btn btn-sm" onClick={onClose}>{t('gloss.close')}</button>
        </div>
        <dl className="glossary">
          {GLOSSARY.map((g) => (
            <div key={g.id}>
              <dt>{g.term}</dt>
              <dd>{g.plain}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
