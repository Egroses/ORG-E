import { useState } from 'react';
import type { LiveProgress, LoadStep } from '../data/types';
import { LiveWait } from '../components/LiveWait';
import { FovInput } from '../components/FovInput';
import { FOV_OPTIONS, KNOWN } from '../data/catalog';
import { R } from '../ui/realisticText';
import { num } from '../i18n';
import { useI18n } from '../i18n/react';
import { searchErrorKey, useSearchSubmit, type SearchResult } from '../lib/useSearchSubmit';

interface Props {
  initialText?: string;
  initialFov?: number;
  loading: LoadStep | null;
  /** Set once the backend says this position is downloaded live (not in the saved set). */
  live?: LiveProgress | null;
  error?: string | null;
  onSearch: (text: string, fov: number) => SearchResult;
  /** Official name of the position, when it was found by name. */
  resolvedName?: string | null;
  onTryCase: () => void;
  /** Realistic mode: other wording, quick picks for the cached targets, no practice-case button. */
  realistic?: boolean;
}

const STEPS: Exclude<LoadStep, 'done'>[] = ['finding', 'downloading', 'stacking'];

export function ExploreGate({ initialText = '', initialFov = 0.1, loading, live, resolvedName, error, onSearch, onTryCase, realistic = false }: Props) {
  const { t } = useI18n();
  const [text, setText] = useState(initialText);
  const [fov, setFov] = useState(initialFov);
  const { busy, error: formError, submit: runSearch, clear } = useSearchSubmit((tx) => onSearch(tx, fov));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    runSearch(text);
  }

  if (loading && loading !== 'done') {
    const idx = STEPS.findIndex((s) => s === loading);
    return (
      <main className="page page-narrow">
        <section className="card gate">
          <h1 className="t-heading">{realistic ? R.gateTitle : t('gate.preparing')}</h1>
          {resolvedName && <p className="t-body" role="status">{t('resolve.found', { name: resolvedName })}</p>}
          <ol className="load-steps">
            {STEPS.map((s, i) => (
              <li key={s} className={i < idx ? 'done' : i === idx ? 'now' : ''}>
                <span className="load-dot" aria-hidden="true" />
                {t(`gate.step.${s}`)}
                {i < idx && <span className="sr-only"> ({t('gate.done')})</span>}
                {i === idx && <span className="sr-only"> ({t('gate.inProgress')})</span>}
              </li>
            ))}
          </ol>
          {live && <LiveWait live={live} />}
          {realistic ? (
            !live && <p className="t-caption c-3">{R.gateLoading}</p>
          ) : (
            <>
              {!live && <p className="t-caption c-3">{t('gate.wait')}</p>}
              <button type="button" className="btn" onClick={onTryCase}>{t('gate.tryCase')}</button>
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="page page-narrow">
      <form className="card gate" onSubmit={submit}>
        <h1 className="t-heading">{realistic ? R.gateTitle : t('gate.title')}</h1>
        <p className="t-lead c-2">{realistic ? R.gateLead : t('gate.lead')}</p>
        <label htmlFor="where" className="t-label">{t('gate.where')}</label>
        <input
          id="where"
          type="text"
          value={text}
          onChange={(e) => { setText(e.target.value); clear(); }}
          placeholder={t('gate.placeholder')}
          aria-describedby={formError || error ? 'gate-error' : undefined}
        />
        <span className="t-label" id="fov-label">{t('gate.howMuch')}</span>
        <div className="seg seg-wrap" role="group" aria-labelledby="fov-label">
          {FOV_OPTIONS.map((o) => (
            <button key={o.value} type="button"  aria-pressed={fov === o.value} onClick={() => setFov(o.value)}>
              {o.name} <span className="c-3">{o.sub} · {num(Math.round(o.value * 60), 0)}′</span>
            </button>
          ))}
        </div>
        <div className="row wrap">
          <FovInput valueDeg={fov} onChange={setFov} />
          <p className="t-caption c-3">{t('gate.bigger')}</p>
        </div>
        {realistic && (
          <>
            <p className="t-caption c-3">{R.gateHelp}</p>
            <div className="row wrap" role="group" aria-label={t('gate.cached')}>
              {Object.values(KNOWN).map((k) => (
                <button key={k.id} type="button" className="btn btn-sm" onClick={() => runSearch(k.name)}>{k.name}</button>
              ))}
            </div>
          </>
        )}
        {busy && <p className="t-caption c-2" role="status">{t('resolve.busy', { name: busy })}</p>}
        {(formError || error) && <p id="gate-error" className="form-error" role="alert">{formError ? t(searchErrorKey(formError)) : error}</p>}
        <button type="submit" className="btn btn-primary btn-lg">{t('gate.show')}</button>
      </form>
    </main>
  );
}
