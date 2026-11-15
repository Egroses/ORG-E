import { useId, useState } from 'react';
import { checkFovArcmin, FOV_MAX_ARCMIN, FOV_MIN_ARCMIN } from '../lib/fov';
import { num } from '../i18n';
import { useI18n } from '../i18n/react';
import './fov-input.css';

/** Field size in arcminutes, 3 to 15. A value outside that range is clamped and said so; text that is not a number is refused. */
export function FovInput({ valueDeg, onChange, maxDeg }: { valueDeg: number; onChange: (deg: number) => void; maxDeg?: number }) {
  const maxArcmin = maxDeg !== undefined ? Math.round(maxDeg * 60) : FOV_MAX_ARCMIN;
  const { t } = useI18n();
  const id = useId();
  const shown = String(Math.round(valueDeg * 60 * 10) / 10);
  const [text, setText] = useState(shown);
  const [msg, setMsg] = useState<string | null>(null);
  // When the field changes from outside (a preset button), show it and drop an old message; our own commit keeps its message.
  const [seen, setSeen] = useState(shown);
  const [committed, setCommitted] = useState<string | null>(null);
  if (seen !== shown) {
    setSeen(shown);
    setText(shown);
    if (committed !== shown) setMsg(null);
  }

  function commit() {
    const r = checkFovArcmin(text, maxArcmin);
    if (!r.ok) {
      setMsg(t('fov.err.nan', { min: FOV_MIN_ARCMIN, max: maxArcmin }));
      return;
    }
    setMsg(r.clamped ? (maxArcmin < FOV_MAX_ARCMIN ? t('fov.savedMax') : t('fov.err.range', { min: FOV_MIN_ARCMIN, max: maxArcmin, v: num(r.arcmin, 0) })) : null);
    setText(String(r.arcmin));
    setCommitted(String(Math.round(r.deg * 60 * 10) / 10));
    if (Math.abs(r.deg - valueDeg) > 1e-6) onChange(r.deg);
  }

  return (
    <form className="fov-input" onSubmit={(e) => { e.preventDefault(); commit(); }} noValidate>
      <label htmlFor={id} className="sr-only">{t('fov.custom')}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={text}
        aria-invalid={msg ? true : undefined}
        aria-describedby={msg ? `${id}-msg` : undefined}
        title={t('fov.custom')}
        onChange={(e) => { setText(e.target.value); setMsg(null); }}
        onBlur={() => { if (text !== shown) commit(); }}
      />
      <span aria-hidden="true">′</span>
      {msg && <p id={`${id}-msg`} className="fov-msg" role="alert">{msg}</p>}
    </form>
  );
}
