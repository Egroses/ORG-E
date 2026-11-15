import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Chip, LiveProgress, LoadStep, PatchRequest, Pt, SkyPatch, TargetId } from './data/types';
import { CASES, FOV_OPTIONS, KNOWN } from './data/catalog';
import { caseRequest, loadPatch, patchKey, realisticRequest } from './data/provider';
import { answerKey, evaluate } from './sky/analysis';
import { lookupName, parseCoords } from './sky/astro';
import { resolveName, ResolveError, type Resolved } from './sky/resolve';
import type { SearchResult } from './lib/useSearchSubmit';
import {
  clearReveal, loadProgress, loadReveal, saveProgress, storeReveal, type Candidate, type Observation, type Progress, type RevealState,
} from './state/progress';
import { TopBar, type NavKey, type ToolControls } from './components/TopBar';
import { aladinUrl } from './lib/format';
import { applyTheme, loadTheme, type Theme } from './state/theme';
import { Landing } from './screens/Landing';
import { CaseBoard } from './screens/CaseBoard';
import { Playfield } from './screens/Playfield';
import { RealisticTool } from './screens/RealisticTool';
import {
  DEFAULT_REALISTIC, loadViewMode, parseEmbed, parseRealistic, parseViewMode, realisticPairs, saveViewMode, type RealisticState, type ViewMode,
} from './state/viewState';
import { R } from './ui/realisticText';
import { errorText } from './data/errors';
import { isAbort } from './data/realProvider';
import { useI18n } from './i18n/react';
import { Reveal } from './screens/Reveal';
import { FieldReport } from './screens/FieldReport';
import { ExploreGate } from './screens/ExploreGate';
import { EmbedStatus, EmbedView } from './screens/EmbedView';
import { Glossary } from './components/Glossary';
import { Tour } from './components/Tour';
import { tourSeen } from './state/tour';

/**
 * Every screen has its own address (hash routes), so the browser's back button, refresh and shared links
 * land where the player expects:
 *   #/  #/cases  #/case/<id>  #/case/<id>/result  #/report  #/explore  #/explore?ra=..&dec=..&fov=..
 */
type Route =
  | { name: 'landing' }
  | { name: 'board' }
  | { name: 'case'; id: TargetId }
  | { name: 'reveal'; id: TargetId }
  | { name: 'report' }
  | { name: 'explore'; req: PatchRequest | null; view: ViewMode; rs: RealisticState; embed?: boolean };

interface LoadState {
  step: LoadStep | null;
  /** Progress of a live download (only a position that is not saved has one). */
  live?: LiveProgress | null;
  patch: SkyPatch | null;
  /** What went wrong, kept as data: the text is made in the current language when it is shown. */
  error: { err: unknown; strict: boolean } | null;
}

/** The name lookup in flight, so a newer search can stop an older one. */
let lookupCtl: AbortController | null = null;

const isTarget = (s: string | undefined): s is TargetId => !!s && CASES.some((c) => c.id === s);

/** The position part of a link. */
const reqQuery = (req: PatchRequest) => `ra=${req.ra.toFixed(5)}&dec=${req.dec.toFixed(5)}&fov=${req.fovDeg}`;
/** Key of a load: position, field, grouping, detectors (so Game and Realistic loads never mix). */
const loadKey = patchKey;

function parseReq(params: URLSearchParams): PatchRequest | null {
  if (!params.has('ra') || !params.has('dec')) return null;
  const ra = Number(params.get('ra'));
  const dec = Number(params.get('dec'));
  const fov = Number(params.get('fov') ?? 0.1);
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || ra < 0 || ra >= 360 || Math.abs(dec) > 90) return null;
  const req: PatchRequest = { ra, dec, fovDeg: FOV_OPTIONS.some((o) => o.value === fov) ? fov : 0.1 };
  // The practice targets are already loaded, so the same spot opens instantly.
  const isCaseSpot = CASES.some((c) => {
    const r = caseRequest(c.id, req.fovDeg);
    return Math.abs(r.ra - ra) < 1e-4 && Math.abs(r.dec - dec) < 1e-4;
  });
  if (isCaseSpot) req.cached = true;
  return req;
}

function parseRoute(hash: string, storedMode: ViewMode): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const [head, id, tail] = path.split('/').filter(Boolean);
  if (head === 'cases') return { name: 'board' };
  if (head === 'case' && isTarget(id)) return tail === 'result' ? { name: 'reveal', id } : { name: 'case', id };
  if (head === 'report') return { name: 'report' };
  if (head === 'explore') {
    const params = new URLSearchParams(query);
    // The address wins; without `view` an old link uses the remembered mode (Game for new visitors).
    // The embedded page always shows the Realistic picture (all six bands), whatever the stored mode is.
    const embed = parseEmbed(params);
    const view = embed ? 'realistic' : parseViewMode(params) ?? storedMode;
    const rs = parseRealistic(params);
    const base = parseReq(params);
    const req = base && view === 'realistic' ? realisticRequest(base.ra, base.dec, base.fovDeg, rs.group) : base;
    return { name: 'explore', req, view, rs, ...(embed ? { embed } : {}) };
  }
  return { name: 'landing' };
}

function routeHash(r: Route): string {
  switch (r.name) {
    case 'landing': return '#/';
    case 'board': return '#/cases';
    case 'case': return `#/case/${r.id}`;
    case 'reveal': return `#/case/${r.id}/result`;
    case 'report': return '#/report';
    case 'explore': {
      const parts = r.req ? [reqQuery(r.req)] : [];
      parts.push(...(r.view === 'realistic' ? realisticPairs(r.rs).map(([k, v]) => `${k}=${v}`) : ['view=game']));
      if (r.embed) parts.push('embed=1');
      return `#/explore?${parts.join('&')}`;
    }
  }
}

function initialHash() {
  // Older links used ?ra=..&dec=.. on the page itself; move them to the explore route.
  const legacy = parseReq(new URLSearchParams(window.location.search));
  if (legacy) {
    const h = routeHash({ name: 'explore', req: legacy, view: 'game', rs: DEFAULT_REALISTIC });
    window.history.replaceState(null, '', window.location.pathname + h);
    return h;
  }
  return window.location.hash;
}

/** `error` is set when the text is neither a known name nor coordinates; the form words it in the current language. */
function resolveQuery(text: string, fov: number, view: ViewMode, group: RealisticState['group']): { req: PatchRequest } | { error: true } {
  const id = lookupName(text);
  if (id) {
    const c = caseRequest(id, fov);
    return { req: view === 'realistic' ? realisticRequest(c.ra, c.dec, fov, group) : c };
  }
  const c = parseCoords(text);
  if (c) return { req: requestAt(c, fov, view, group) };
  return { error: true };
}

/** A request for a free position. Within 10 arcseconds of a saved target it uses that target's exact numbers, so the
 *  backend finds the saved copy (see docs/patch-api.md). */
function requestAt(c: { ra: number; dec: number }, fov: number, view: ViewMode, group: RealisticState['group']): PatchRequest {
  const near = CASES.find((k) => {
    const r = caseRequest(k.id, fov);
    return Math.hypot((r.ra - c.ra) * Math.cos((c.dec * Math.PI) / 180), r.dec - c.dec) * 3600 < 10;
  });
  if (near) {
    const r = caseRequest(near.id, fov);
    return view === 'realistic' ? realisticRequest(r.ra, r.dec, fov, group) : r;
  }
  return view === 'realistic' ? realisticRequest(c.ra, c.dec, fov, group) : { ra: c.ra, dec: c.dec, fovDeg: fov };
}

const shareUrl = (req: PatchRequest, view: ViewMode = 'game', rs: RealisticState = DEFAULT_REALISTIC, embed = false) =>
  `${window.location.origin}${window.location.pathname}${routeHash({ name: 'explore', req, view, rs, embed })}`;

export default function App() {
  const { t } = useI18n();
  const [hash, setHash] = useState(initialHash);
  const [storedMode, setStoredMode] = useState<ViewMode>(loadViewMode);
  const route = useMemo(() => parseRoute(hash, storedMode), [hash, storedMode]);
  // Latest Realistic view state (band, visit, stretch, ...), kept for the share link and the address bar.
  const [liveRaw, setLive] = useState<{ key: string; s: RealisticState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [patches, setPatches] = useState<Partial<Record<TargetId, SkyPatch>>>({});
  const [reveal, setReveal] = useState<RevealState | null>(loadReveal);
  const [loads, setLoads] = useState<Record<string, LoadState>>({});
  const [queryText, setQueryText] = useState('');
  /** The official name of a position found by name, kept while that position is on screen. */
  const [resolved, setResolved] = useState<{ name: string; ra: number; dec: number } | null>(null);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const toggleTheme = () => setTheme((t) => { const n = t === 'dark' ? 'light' : 'dark'; applyTheme(n); return n; });
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [tourForced, setTourForced] = useState(false);
  const [tourClosed, setTourClosed] = useState(false);
  // The short tour opens once, the first time someone reaches a photo screen; the Tour button reopens it.
  const tourOpen = tourForced || ((route.name === 'case' || route.name === 'explore') && !tourClosed && !tourSeen());

  useEffect(() => {
    for (const c of CASES) {
      loadPatch(caseRequest(c.id)).then((p) => setPatches((prev) => ({ ...prev, [c.id]: p })));
    }
  }, []);

  useEffect(() => saveProgress(progress), [progress]);

  // Back / forward buttons and hand-edited addresses.
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [hash]);

  const exploreReq = route.name === 'explore' ? route.req : null;
  useEffect(() => {
    if (!exploreReq) return;
    const k = loadKey(exploreReq);
    const empty: LoadState = { step: null, patch: null, error: null };
    const set = (s: Partial<LoadState>) => setLoads((prev) => ({ ...prev, [k]: { ...empty, ...prev[k], ...s } }));
    // Leaving the screen stops the polling (a live download can take 15 minutes or more).
    const ctl = new AbortController();
    loadPatch(exploreReq, (step) => set({ step, error: null }), { signal: ctl.signal, onProgress: (live) => set({ live }) })
      .then((patch) => set({ patch, step: 'done', live: null, error: null }))
      .catch((e: unknown) => {
        if (ctl.signal.aborted || isAbort(e)) return;
        set({ step: null, live: null, patch: null, error: { err: e, strict: !!exploreReq.strict } });
      });
    return () => ctl.abort();
  }, [exploreReq]);

  const navigate = useCallback((r: Route) => {
    const h = routeHash(r);
    if (h !== window.location.hash) window.history.pushState(null, '', h);
    setHash(h);
  }, []);

  const goHome = () => navigate({ name: 'landing' });
  const goBoard = () => navigate({ name: 'board' });
  const goExplore = () => navigate({ name: 'explore', req: null, view: storedMode, rs: DEFAULT_REALISTIC });
  const goRealistic = () => {
    saveViewMode('realistic');
    setStoredMode('realistic');
    navigate({ name: 'explore', req: null, view: 'realistic', rs: DEFAULT_REALISTIC });
  };
  const exploreRoute = route.name === 'explore' ? route : null;
  const curKey = exploreRoute?.req ? loadKey(exploreRoute.req) : '';
  // Only a state that belongs to the field on screen counts (a stale one would overwrite a freshly opened link).
  const live = liveRaw && liveRaw.key === curKey ? liveRaw.s : null;

  /** Game | Realistic switch. In Explore the same spot is kept; from a practice case the case position is used. */
  function switchMode(m: ViewMode) {
    saveViewMode(m);
    setStoredMode(m);
    const fov = exploreRoute?.req?.fovDeg ?? 0.1;
    let at: { ra: number; dec: number } | null = exploreRoute?.req ?? null;
    if (!at && route.name === 'case') at = caseRequest(route.id, fov);
    if (m === 'realistic') {
      navigate({ name: 'explore', req: at ? realisticRequest(at.ra, at.dec, fov, DEFAULT_REALISTIC.group) : null, view: 'realistic', rs: DEFAULT_REALISTIC });
    } else if (exploreRoute) {
      navigate({ name: 'explore', req: at ? { ra: at.ra, dec: at.dec, fovDeg: fov } : null, view: 'game', rs: DEFAULT_REALISTIC });
    }
  }
  const openCase = (id: TargetId) => {
    setAttempt((a) => a + 1);
    navigate({ name: 'case', id });
  };

  const nextOpenCase = (after: TargetId) => {
    const i = CASES.findIndex((c) => c.id === after);
    const ordered = [...CASES.slice(i + 1), ...CASES.slice(0, i)];
    return ordered.find((c) => !progress.results[c.id]) ?? null;
  };

  function handleReveal(id: TargetId, mark: Pt | null, chips: Chip[], gaveUp: boolean, peeked: boolean) {
    const patch = patches[id];
    if (!patch) return;
    const ev = evaluate(answerKey(patch, KNOWN[id]), mark, chips, gaveUp);
    // First attempt counts; retries, and rounds where the answer was seen first, are practice.
    const counted = peeked ? 'miss' : ev.outcome;
    setProgress((p) => ({ ...p, results: { ...p.results, [id]: p.results[id] ?? counted } }));
    const r: RevealState = { caseId: id, mark, chips, gaveUp, peeked };
    setReveal(r);
    storeReveal(r);
    navigate({ name: 'reveal', id });
  }

  /** Built-in names and coordinates work offline and answer at once; anything else is looked up by the service. */
  function handleSearch(text: string, fov: number): SearchResult {
    const view = exploreRoute?.view ?? 'game';
    const group = exploreRoute?.rs.group ?? DEFAULT_REALISTIC.group;
    const go = (req: PatchRequest) => {
      navigate({ name: 'explore', req, view, rs: { ...DEFAULT_REALISTIC, group } });
    };
    const r = resolveQuery(text, fov, view, group);
    if ('req' in r) {
      setQueryText(text);
      setResolved(null);
      go(r.req);
      return null;
    }
    // A newer lookup replaces an older one.
    lookupCtl?.abort();
    const ctl = new AbortController();
    lookupCtl = ctl;
    return resolveName(text, { signal: ctl.signal }).then(
      (res: Resolved) => {
        const req = requestAt(res, fov, view, group);
        setQueryText(text);
        setResolved({ name: res.name, ra: req.ra, dec: req.dec });
        go(req);
        return null;
      },
      (e: unknown) => (e instanceof ResolveError ? e.kind : ctl.signal.aborted ? 'aborted' : 'service'),
    );
  }

  function resetProgress() {
    setProgress((p) => ({ ...p, results: {} }));
    setReveal(null);
    clearReveal();
  }

  function saveObservation(o: Observation) {
    const n = progress.observations.length + 1;
    setProgress((p) => ({ ...p, observations: [...p.observations, o] }));
    return n;
  }

  function saveCandidate(c: Omit<Candidate, 'id' | 'savedAt'>) {
    const full: Candidate = { ...c, id: `c${Date.now().toString(36)}`, savedAt: new Date().toISOString() };
    setProgress((p) => ({ ...p, candidates: [...p.candidates, full] }));
  }

  function removeCandidate(id: string) {
    setProgress((p) => ({ ...p, candidates: p.candidates.filter((c) => c.id !== id) }));
  }

  const spotShare = (ra: number, dec: number, fovDeg: number) => ({
    url: shareUrl({ ra, dec, fovDeg }),
    embedUrl: shareUrl(realisticRequest(ra, dec, fovDeg, DEFAULT_REALISTIC.group), 'realistic', DEFAULT_REALISTIC, true),
    aladin: aladinUrl(ra, dec, fovDeg),
  });

  // The address bar always carries the Realistic view state, so a copied link reopens the same picture.
  useEffect(() => {
    if (!exploreRoute || exploreRoute.view !== 'realistic' || !exploreRoute.req || !live) return;
    const h = routeHash({ ...exploreRoute, rs: live });
    if (h !== window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search + h);
  }, [exploreRoute, live]);

  const top = (active: NavKey, tool?: ToolControls) => (
    <>
      {glossaryOpen && <Glossary onClose={() => setGlossaryOpen(false)} />}
      {tourOpen && <Tour onClose={() => { setTourForced(false); setTourClosed(true); }} />}
      <TopBar
        results={progress.results}
        active={active}
        theme={theme}
        onTheme={toggleTheme}
        onHome={goHome}
        onCases={goBoard}
        onExplore={goExplore}
        mode={route.name === 'explore' ? route.view : 'game'}
        onMode={switchMode}
        onReport={() => navigate({ name: 'report' })}
        onGlossary={() => setGlossaryOpen(true)}
        onTour={() => setTourForced(true)}
        tool={tool}
      />
    </>
  );

  if (route.name === 'landing') {
    return (
      <div className="app">
        {top('home')}
        <Landing heroPatch={patches.barnard ?? null} patches={patches} results={progress.results} onStart={goBoard} onOpen={openCase} onJump={(t) => handleSearch(t, 0.1)} onRealistic={goRealistic} />
      </div>
    );
  }

  if (route.name === 'board') {
    return (
      <div className="app">
        {top('cases')}
        <CaseBoard results={progress.results} patches={patches} onOpen={openCase} onExplore={goExplore} onReset={resetProgress} />
      </div>
    );
  }

  // A result page without a stored result (new tab, storage blocked) falls back to the case itself.
  const shownReveal = route.name === 'reveal' && reveal?.caseId === route.id ? reveal : null;

  if (route.name === 'reveal' && shownReveal) {
    const id = route.id;
    const patch = patches[id];
    const def = CASES.find((c) => c.id === id)!;
    const next = nextOpenCase(id);
    if (!patch) {
      return (
        <div className="app">
          {top('cases')}
          <main className="page"><p className="t-lead c-2">{t('common.loadingPhotos')}</p></main>
        </div>
      );
    }
    const answer = answerKey(patch, KNOWN[id]);
    const ev = evaluate(answer, shownReveal.mark, shownReveal.chips, shownReveal.gaveUp);
    return (
      <div className="app">
        {top('cases')}
        <Reveal
          caseDef={def}
          patch={patch}
          answer={answer}
          outcome={ev.outcome}
          hit={ev.hit}
          mark={shownReveal.mark}
          chips={shownReveal.chips}
          gaveUp={shownReveal.gaveUp}
          peeked={shownReveal.peeked}
          nextLabel={next ? t('rev.next') : t('rev.report')}
          onNext={() => (next ? openCase(next.id) : navigate({ name: 'report' }))}
          onRetry={() => openCase(id)}
        />
      </div>
    );
  }

  if (route.name === 'case' || route.name === 'reveal') {
    const id = route.id;
    const caseDef = CASES.find((c) => c.id === id)!;
    const patch = patches[id];
    const tool: ToolControls = {
      target: id,
      onTarget: openCase,
      onSearch: (t) => handleSearch(t, 0.1),
      share: patch ? spotShare(patch.center.ra, patch.center.dec, patch.fovDeg) : undefined,
    };
    return (
      <div className="app app-tool">
        {top('cases', tool)}
        {patch ? (
          <Playfield
            key={`${id}-${attempt}`}
            mode="case"
            patch={patch}
            caseDef={caseDef}
            onReveal={(mark, chips, gaveUp, peeked) => handleReveal(id, mark, chips, gaveUp, peeked)}
          />
        ) : (
          <main className="page"><p className="t-lead c-2">{t('common.loadingPhotos')}</p></main>
        )}
      </div>
    );
  }

  if (route.name === 'report') {
    return (
      <div className="app">
        {top('report')}
        <FieldReport
          results={progress.results}
          heroPatch={patches.barnard ?? null}
          candidates={progress.candidates}
          onRemoveCandidate={removeCandidate}
          onExplore={goExplore}
          onReset={() => { resetProgress(); goBoard(); }}
        />
      </div>
    );
  }

  // explore
  const req = route.req;
  if (route.embed) {
    const embedLoad = req ? loads[loadKey(req)] : undefined;
    if (!req) return <EmbedStatus error={t('embed.noPosition')} />;
    if (embedLoad?.error) return <EmbedStatus error={R.loadError(errorText(embedLoad.error.err))} />;
    if (!embedLoad?.patch) return <EmbedStatus live={embedLoad?.live ?? null} />;
    return (
      <EmbedView
        key={loadKey(req)}
        patch={embedLoad.patch}
        initial={route.rs}
        onState={(st) => setLive({ key: loadKey(req), s: st })}
      />
    );
  }
  const realistic = route.view === 'realistic';
  const load = req ? loads[loadKey(req)] : undefined;
  const caseHere = req ? CASES.find((c) => { const r = caseRequest(c.id, req.fovDeg); return Math.abs(r.ra - req.ra) < 1e-4 && Math.abs(r.dec - req.dec) < 1e-4; }) : undefined;
  const withFov = (v: number): PatchRequest => (realistic ? realisticRequest(req!.ra, req!.dec, v, route.rs.group) : { ra: req!.ra, dec: req!.dec, fovDeg: v });
  const shownName = req && resolved && Math.abs(resolved.ra - req.ra) < 1e-4 && Math.abs(resolved.dec - req.dec) < 1e-4 ? resolved.name : null;
  const exploreTool: ToolControls = {
    target: caseHere?.id ?? (req ? '' : CASES[0].id),
    onTarget: (id) => {
      const c = caseRequest(id, req?.fovDeg ?? 0.1);
      navigate({ name: 'explore', req: realistic ? realisticRequest(c.ra, c.dec, c.fovDeg, route.rs.group) : { ...c, cached: true }, view: route.view, rs: route.rs });
    },
    targetLabel: realistic ? (c) => KNOWN[c.id].name : undefined,
    onSearch: (t) => handleSearch(t, req?.fovDeg ?? 0.1),
    customLabel: shownName ?? undefined,
    fov: req ? { value: req.fovDeg, onChange: (v) => navigate({ name: 'explore', req: withFov(v), view: route.view, rs: realistic ? (live ?? route.rs) : route.rs }) } : undefined,
    share: req && load?.patch
      ? (realistic
        ? { url: shareUrl(req, 'realistic', live ?? route.rs), embedUrl: shareUrl(req, 'realistic', live ?? route.rs, true), aladin: aladinUrl(req.ra, req.dec, req.fovDeg), realistic: true }
        : spotShare(req.ra, req.dec, req.fovDeg))
      : undefined,
  };
  const ready = !!(req && load?.patch);
  return (
    <div className={`app${ready ? ' app-tool' : ''}`}>
      {top('explore', exploreTool)}
      {ready && realistic ? (
        <RealisticTool
          key={loadKey(req!)}
          patch={load!.patch!}
          initial={route.rs}
          onState={(st) => setLive({ key: loadKey(req!), s: st })}
          onGroup={(g) => navigate({ name: 'explore', req: realisticRequest(req!.ra, req!.dec, req!.fovDeg, g), view: 'realistic', rs: { ...(live ?? route.rs), group: g, visit: undefined, ref: undefined } })}
          candidates={progress.candidates}
          onSaveCandidate={saveCandidate}
          onRemoveCandidate={removeCandidate}
        />
      ) : ready ? (
        <Playfield
          key={loadKey(req!)}
          mode="explore"
          patch={load!.patch!}
          onSaveObservation={saveObservation}
          onSaveCandidate={saveCandidate}
          explore={{ ra: req!.ra, dec: req!.dec, fovDeg: req!.fovDeg }}
        />
      ) : (
        <ExploreGate
          initialText={queryText}
          initialFov={req?.fovDeg ?? 0.1}
          loading={req && !load?.error ? load?.step ?? 'finding' : null}
          live={load?.live ?? null}
          resolvedName={shownName}
          error={load?.error ? (load.error.strict ? R.loadError(errorText(load.error.err)) : t('gate.loadError', { msg: errorText(load.error.err) })) : null}
          realistic={realistic}
          onSearch={handleSearch}
          onTryCase={() => openCase(CASES.find((c) => !progress.results[c.id])?.id ?? 'barnard')}
        />
      )}
    </div>
  );
}
