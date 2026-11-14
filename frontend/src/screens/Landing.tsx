import { useEffect, useState } from 'react';
import type { SkyPatch, TargetId } from '../data/types';
import { CASES, KNOWN } from '../data/catalog';
import { SkyCanvas } from '../components/SkyCanvas';
import { Icon } from '../components/Icon';
import { mjdToDateText } from '../lib/format';
import type { Progress } from '../state/progress';
import { R } from '../ui/realisticText';
import { num } from '../i18n';
import { useI18n } from '../i18n/react';

interface Props {
  heroPatch: SkyPatch | null;
  patches: Partial<Record<TargetId, SkyPatch>>;
  results: Progress['results'];
  onStart: () => void;
  onOpen: (id: TargetId) => void;
  onJump: (text: string) => string | null;
  onRealistic: () => void;
}

export function Landing({ heroPatch, patches, results, onStart, onOpen, onJump, onRealistic }: Props) {
  const { t, tp } = useI18n();
  const [epoch, setEpoch] = useState(0);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setEpoch((e) => (e + 1) % 3), 1100);
    return () => window.clearInterval(id);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(onJump(text));
  }

  const hp = heroPatch;
  const e = hp ? Math.min(epoch, hp.epochs.length - 1) : 0;

  return (
    <main className="page wide">
      <section className="hero">
        <div className="hero-text">
          <span className="tag">{t('land.tag')}</span>
          <h1 className="t-display">{t('land.title')}</h1>
          <p className="t-lead c-2">
            {t('land.lead')}
          </p>
          <div className="row wrap">
            <button type="button" className="btn btn-primary btn-lg" onClick={onStart}>{t('land.start')}</button>
            <button type="button" className="btn btn-lg btn-strong" onClick={onRealistic}>{R.landingExplore}</button>
          </div>
          <form className="jump" onSubmit={submit}>
            <label htmlFor="jump" className="t-caption c-3">{t('land.jump')}</label>
            <div className="searchbar">
              <Icon name="search" size={16} />
              <input
                id="jump"
                type="text"
                value={text}
                onChange={(ev) => { setText(ev.target.value); setError(null); }}
                placeholder={t('land.placeholder')}
                aria-describedby={error ? 'jump-error' : undefined}
              />
              <button type="submit" aria-label={t('search.go')}><Icon name="arrow" size={16} /></button>
            </div>
            {error && <p id="jump-error" className="form-error" role="alert">{t('search.error')}</p>}
          </form>
          <p className="t-caption c-3">{t('land.modes', { sub: R.landingExploreSub })}</p>
        </div>

        <figure className="hero-sky">
          {hp ? (
            <SkyCanvas className="hero-canvas" patch={hp} epoch={e} band={0}>
              <div className="sky-lab"><b>{hp.epochs[e].label}</b><span>{tp('map.exposures', hp.epochs[e].imageCount)}</span><span>{hp.epochs[e].dates}</span></div>
            </SkyCanvas>
          ) : (
            <div className="hero-canvas sky sky-loading" />
          )}
          <figcaption className="t-caption c-3">
            {hp ? t('land.caption', { name: KNOWN.barnard.name, fov: num(hp.fovDeg * 60, 0), dates: hp.epochs.map((x) => mjdToDateText(x.mjd)).join(', ') }) : t('common.loadingPhotos')}
          </figcaption>
        </figure>
      </section>

      <section className="sec" aria-labelledby="cases-h">
        <div className="row between">
          <h2 id="cases-h" className="t-heading">{t('land.fiveCases')}</h2>
          <button type="button" className="btn btn-sm" onClick={onStart}>{t('land.allCases')}</button>
        </div>
        <div className="cards5">
          {CASES.map((c) => {
            const p = patches[c.id];
            const best = p ? p.bands.reduce((bi, b, i) => (KNOWN[c.id].snr[b.id] > KNOWN[c.id].snr[p.bands[bi].id] ? i : bi), 0) : 0;
            return (
              <button key={c.id} type="button" className="card case-card" onClick={() => onOpen(c.id)}>
                <span className="case-thumb">
                  {p ? <SkyCanvas patch={p} epoch={Math.min(1, p.epochs.length - 1)} band={best} /> : <span className="sky sky-loading" />}
                </span>
                <span className="case-chip" style={{ '--c': c.color } as React.CSSProperties}>{t('case.n', { n: c.n })}{results[c.id] ? ` · ${t('land.done')}` : ''}</span>
                <strong>{c.nick}</strong>
                <span className="t-caption c-3">{c.mission}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="sec about" aria-labelledby="about-h">
        <h2 id="about-h" className="t-heading">{t('land.whatTitle')}</h2>
        <div className="about-grid">
          <p className="t-body c-2">
            {t('land.what')}
          </p>
          <dl className="facts-grid">
            <div><dt>{t('land.f.pixel')}</dt><dd>{num(6.15, 2)}″</dd></div>
            <div><dt>{t('land.f.bands')}</dt><dd>{t('land.f.bandsV')}</dd></div>
            <div><dt>{t('land.f.wl')}</dt><dd>{num(1.1, 1)} – {num(5.0, 1)} µm</dd></div>
            <div><dt>{t('land.f.job')}</dt><dd>{t('land.f.jobV')}</dd></div>
          </dl>
        </div>
        <ol className="steps">
          <li className="card"><span className="step-n">1</span><b>{t('land.s1')}</b><span className="t-caption c-3">{t('land.s1d')}</span></li>
          <li className="card"><span className="step-n">2</span><b>{t('land.s2')}</b><span className="t-caption c-3">{t('land.s2d')}</span></li>
          <li className="card"><span className="step-n">3</span><b>{t('land.s3')}</b><span className="t-caption c-3">{t('land.s3d')}</span></li>
          <li className="card"><span className="step-n">4</span><b>{t('land.s4')}</b><span className="t-caption c-3">{t('land.s4d')}</span></li>
        </ol>
      </section>

      <footer className="footer">
        <span>{t('land.footer1')}</span>
        <span>{t('land.footer2')}</span>
      </footer>
    </main>
  );
}
