import { useEffect, useRef, useState } from 'react';
import { CASES, FOV_OPTIONS, type CaseDef } from '../data/catalog';
import { R } from '../ui/realisticText';
import type { ViewMode } from '../state/viewState';
import type { TargetId } from '../data/types';
import type { Progress } from '../state/progress';
import type { Theme } from '../state/theme';
import { Icon } from './Icon';
import { LANGS } from '../i18n';
import { useI18n } from '../i18n/react';
import { FovInput } from './FovInput';
import { copyText, iframeSnippet } from '../lib/embedCode';
import { searchErrorKey, useSearchSubmit, type SearchResult } from '../lib/useSearchSubmit';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <rect x="1.5" y="1.5" width="31" height="31" rx="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="17" r="8" fill="none" stroke="var(--accent)" strokeWidth="2.2" />
      <circle cx="19" cy="15" r="2.4" fill="currentColor" />
      <circle cx="11" cy="23" r="1.3" fill="var(--text-3)" />
    </svg>
  );
}

export interface ToolControls {
  /** The target shown in the menu ('' when exploring somewhere else). */
  target: TargetId | '';
  onTarget: (id: TargetId) => void;
  onSearch: (text: string) => SearchResult;
  /** Official name of a position that was looked up by name (shown instead of "Custom position"). */
  customLabel?: string;
  /** Only in Explore: the field of view can be changed. */
  fov?: { value: number; onChange: (v: number) => void; /** Widest field in degrees (a saved target has data for 6 arcminutes only). */ max?: number };
  share?: { url: string; embedUrl: string; aladin: string; realistic?: boolean };
  /** Realistic mode names targets plainly instead of as game cases. */
  targetLabel?: (c: CaseDef) => string;
}

export type NavKey = 'home' | 'cases' | 'explore' | 'report';

interface Props {
  results: Progress['results'];
  active?: NavKey;
  theme: Theme;
  onTheme: () => void;
  onHome: () => void;
  onCases: () => void;
  onExplore: () => void;
  mode: ViewMode;
  onMode: (m: ViewMode) => void;
  onReport: () => void;
  onGlossary: () => void;
  onTour: () => void;
  tool?: ToolControls;
}

/** Game | Realistic switch. */
export function ModeSwitch({ mode, onMode }: { mode: ViewMode; onMode: (m: ViewMode) => void }) {
  const { t } = useI18n();
  return (
    <div className="seg mode-switch" role="group" aria-label={t('mode.label')}>
      <button type="button" aria-pressed={mode === 'game'} title={R.modeGameTitle} onClick={() => onMode('game')}>{R.modeGame}</button>
      <button type="button" aria-pressed={mode === 'realistic'} title={R.modeRealisticTitle} onClick={() => onMode('realistic')}>{R.modeRealistic}</button>
    </div>
  );
}

/** TR | EN switch. */
export function LangSwitch() {
  const { t, lang, setLang } = useI18n();
  return (
    <div className="seg lang-switch" role="group" aria-label={t('lang.label')}>
      {LANGS.map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={lang === l} title={t(`lang.${l}`)} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

function ShareMenu({ url, embedUrl, realistic }: { url: string; embedUrl: string; realistic?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<'link' | 'embed' | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  async function copy(what: 'link' | 'embed') {
    const ok = await copyText(what === 'link' ? url : iframeSnippet(embedUrl));
    setCopied(ok ? what : null);
  }
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="btn btn-sm" aria-label={t('share.label')} aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen((o) => !o); setCopied(null); }}>
        <Icon name="link" size={14} /><span className="lbl">{t('share.label')}</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <button type="button" role="menuitem" onClick={() => copy('link')}><Icon name="copy" size={14} />{copied === 'link' ? R.shareCopied : realistic ? R.shareCopy : t('share.copySpot')}</button>
          <button type="button" role="menuitem" onClick={() => copy('embed')}><Icon name="copy" size={14} />{copied === 'embed' ? t('share.embedCopied') : t('share.copyEmbed')}</button>
          <span className="sr-only" role="status">{copied === 'link' ? R.shareCopied : copied === 'embed' ? t('share.embedCopied') : ''}</span>
        </div>
      )}
    </div>
  );
}

function SearchBox({ onSearch }: { onSearch: (t: string) => SearchResult }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const { busy, error: err, submit, clear } = useSearchSubmit(onSearch);
  return (
    <form
      className="search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) submit(text);
      }}
    >
      <Icon name="search" size={14} />
      <input
        type="text"
        value={text}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => { setText(e.target.value); clear(); }}
        aria-label={t('search.label')}
        aria-describedby={err ? 'search-err' : undefined}
        placeholder={t('search.placeholder')}
      />
      <button type="submit" aria-label={t('search.go')}><Icon name="arrow" size={14} /></button>
      {busy && <p className="search-err search-busy" role="status">{t('resolve.busy', { name: busy })}</p>}
      {err && <p id="search-err" className="search-err" role="alert">{t(searchErrorKey(err))}</p>}
    </form>
  );
}

export function TopBar({ results, active, theme, onTheme, onHome, onCases, onExplore, mode, onMode, onReport, onGlossary, onTour, tool }: Props) {
  const { t } = useI18n();
  const done = CASES.filter((c) => results[c.id]).length;
  const nav: { key: NavKey; name: string; go: () => void }[] = [
    { key: 'cases', name: t('nav.cases'), go: onCases },
    { key: 'explore', name: t('nav.explore'), go: onExplore },
    { key: 'report', name: t('nav.notebook'), go: onReport },
  ];
  return (
    <header className="topbar">
      <div className="tb-group">
        <button type="button" className="brand" onClick={onHome} aria-label={t('nav.home')}>
          <Logo />
          <span>Sky Quest</span>
        </button>
        <ModeSwitch mode={mode} onMode={onMode} />
        <nav className="nav" aria-label={t('nav.main')}>
          {nav.map((n) => (
            <button key={n.key} type="button" aria-current={active === n.key ? 'page' : undefined} onClick={n.go}>{n.name}</button>
          ))}
        </nav>
      </div>

      {tool && (
        <div className="tb-group tb-tool">
          <label className="select-wrap">
            <span className="sr-only">{t('tb.target')}</span>
            <select className="select" value={tool.target} onChange={(e) => e.target.value && tool.onTarget(e.target.value as TargetId)}>
              {tool.target === '' && <option value="">{tool.customLabel ?? t('tb.custom')}</option>}
              {CASES.map((c) => <option key={c.id} value={c.id}>{tool.targetLabel ? tool.targetLabel(c) : t('tb.caseOption', { n: c.n, nick: c.nick })}</option>)}
            </select>
          </label>
          <SearchBox onSearch={tool.onSearch} />
          {tool.fov && (
            <div className="seg" role="group" aria-label={t('r.fovTitle')}>
              {FOV_OPTIONS.map((o) => (
                <button key={o.value} type="button" aria-pressed={tool.fov!.value === o.value} disabled={o.value > (tool.fov!.max ?? 1) + 1e-6} onClick={() => tool.fov!.onChange(o.value)} title={o.value > (tool.fov!.max ?? 1) + 1e-6 ? t('fov.savedMax') : t('tb.fovTitle', { name: o.name, sub: o.sub })}>
                  {Math.round(o.value * 60)}′
                </button>
              ))}
            </div>
          )}
          {tool.fov && <FovInput valueDeg={tool.fov.value} onChange={tool.fov.onChange} maxDeg={tool.fov.max} />}
          {tool.share && <ShareMenu url={tool.share.url} embedUrl={tool.share.embedUrl} realistic={tool.share.realistic} />}
          {tool.share && (
            <a className="btn btn-sm" href={tool.share.aladin} target="_blank" rel="noopener noreferrer" title={R.shareAladin} aria-label={R.shareAladin}>
              <Icon name="external" size={14} /><span className="lbl">{R.shareAladin}</span>
            </a>
          )}
        </div>
      )}

      <div className="tb-group tb-right">
        <LangSwitch />
        <div className="progress" role="img" aria-label={t('tb.progress', { done })}>
          {CASES.map((c) => (
            <i key={c.id} className={results[c.id] ? 'on' : ''} style={results[c.id] ? { background: c.color, borderColor: c.color } : undefined} />
          ))}
          <span>{done}/5</span>
        </div>
        <button type="button" className="icon-btn" onClick={onTheme} aria-label={theme === 'dark' ? t('tb.toLight') : t('tb.toDark')} title={theme === 'dark' ? t('tb.light') : t('tb.dark')}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button type="button" className="btn btn-sm" onClick={onTour} aria-label={t('tour.label')} title={t('tour.label')}><Icon name="tour" size={14} /><span>{t('tb.tour')}</span></button>
        <button type="button" className="btn btn-sm" onClick={onGlossary} aria-label={t('tb.wordsLabel')} title={t('tb.words')}><Icon name="book" size={14} /><span>{t('tb.words')}</span></button>
      </div>
    </header>
  );
}
