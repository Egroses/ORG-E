import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Chip, LoadStep, PatchRequest, Pt, SkyPatch, TargetId } from './data/types';
import { CASES, FOV_OPTIONS, KNOWN } from './data/catalog';
import { caseRequest, loadPatch } from './data/provider';
import { answerKey, evaluate } from './sky/analysis';
import { lookupName, parseCoords } from './sky/astro';
import {
  clearReveal, loadProgress, loadReveal, saveProgress, storeReveal, type Observation, type Progress, type RevealState,
} from './state/progress';
import { TopBar } from './components/TopBar';
import { Landing } from './screens/Landing';
import { CaseBoard } from './screens/CaseBoard';
import { Playfield } from './screens/Playfield';
import { Reveal } from './screens/Reveal';
import { FieldReport } from './screens/FieldReport';
import { ExploreGate } from './screens/ExploreGate';

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
  | { name: 'explore'; req: PatchRequest | null };

interface LoadState {
  step: LoadStep | null;
  patch: SkyPatch | null;
  error: string | null;
}

const isTarget = (s: string | undefined): s is TargetId => !!s && CASES.some((c) => c.id === s);

const reqQuery = (req: PatchRequest) => `ra=${req.ra.toFixed(5)}&dec=${req.dec.toFixed(5)}&fov=${req.fovDeg}`;

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

function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const [head, id, tail] = path.split('/').filter(Boolean);
  if (head === 'cases') return { name: 'board' };
  if (head === 'case' && isTarget(id)) return tail === 'result' ? { name: 'reveal', id } : { name: 'case', id };
  if (head === 'report') return { name: 'report' };
  if (head === 'explore') return { name: 'explore', req: parseReq(new URLSearchParams(query)) };
  return { name: 'landing' };
}

function routeHash(r: Route): string {
  switch (r.name) {
    case 'landing': return '#/';
    case 'board': return '#/cases';
    case 'case': return `#/case/${r.id}`;
    case 'reveal': return `#/case/${r.id}/result`;
    case 'report': return '#/report';
    case 'explore': return r.req ? `#/explore?${reqQuery(r.req)}` : '#/explore';
  }
}

function initialHash() {
  // Older links used ?ra=..&dec=.. on the page itself; move them to the explore route.
  const legacy = parseReq(new URLSearchParams(window.location.search));
  if (legacy) {
    const h = routeHash({ name: 'explore', req: legacy });
    window.history.replaceState(null, '', window.location.pathname + h);
    return h;
  }
  return window.location.hash;
}

function resolveQuery(text: string, fov: number): { req: PatchRequest } | { error: string } {
  const id = lookupName(text);
  if (id) return { req: caseRequest(id, fov) };
  const c = parseCoords(text);
  if (c) return { req: { ra: c.ra, dec: c.dec, fovDeg: fov } };
  return { error: 'Type a name like “WISE 0855” or coordinates like 08h55m10s −07°14′42″.' };
}

const shareUrl = (req: PatchRequest) =>
  `${window.location.origin}${window.location.pathname}${routeHash({ name: 'explore', req })}`;

export default function App() {
  const [hash, setHash] = useState(initialHash);
  const route = useMemo(() => parseRoute(hash), [hash]);
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [patches, setPatches] = useState<Partial<Record<TargetId, SkyPatch>>>({});
  const [reveal, setReveal] = useState<RevealState | null>(loadReveal);
  const [loads, setLoads] = useState<Record<string, LoadState>>({});
  const [queryText, setQueryText] = useState('');

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
    const k = reqQuery(exploreReq);
    const empty: LoadState = { step: null, patch: null, error: null };
    const set = (s: Partial<LoadState>) => setLoads((prev) => ({ ...prev, [k]: { ...empty, ...prev[k], ...s } }));
    loadPatch(exploreReq, (step) => set({ step, error: null }))
      .then((patch) => set({ patch, step: 'done', error: null }))
      .catch(() => set({ step: null, patch: null, error: 'Could not load that patch of sky. Try again or pick another spot.' }));
  }, [exploreReq]);

  const navigate = useCallback((r: Route) => {
    const h = routeHash(r);
    if (h !== window.location.hash) window.history.pushState(null, '', h);
    setHash(h);
  }, []);

  const goHome = () => navigate({ name: 'landing' });
  const goBoard = () => navigate({ name: 'board' });
  const goExplore = () => navigate({ name: 'explore', req: null });
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

  function handleSearch(text: string, fov: number): string | null {
    const r = resolveQuery(text, fov);
    if ('error' in r) return r.error;
    setQueryText(text);
    navigate({ name: 'explore', req: r.req });
    return null;
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

  const top = (opts: { cases?: boolean; center?: React.ReactNode } = {}) => (
    <TopBar results={progress.results} onHome={goHome} onExplore={goExplore} onCases={opts.cases ? goBoard : undefined} center={opts.center} />
  );

  if (route.name === 'landing') {
    return <Landing heroPatch={patches.barnard ?? null} onStart={goBoard} onJump={(t) => handleSearch(t, 0.1)} onExplore={goExplore} />;
  }

  if (route.name === 'board') {
    return (
      <>
        {top()}
        <CaseBoard results={progress.results} patches={patches} onOpen={openCase} onExplore={goExplore} onReset={resetProgress} />
      </>
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
        <>
          {top({ cases: true })}
          <main className="page"><p className="page-lead">Loading the photos…</p></main>
        </>
      );
    }
    const answer = answerKey(patch, KNOWN[id]);
    const ev = evaluate(answer, shownReveal.mark, shownReveal.chips, shownReveal.gaveUp);
    return (
      <>
        {top({ cases: true })}
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
          nextLabel={next ? 'Next case' : 'See your field report'}
          onNext={() => (next ? openCase(next.id) : navigate({ name: 'report' }))}
          onRetry={() => openCase(id)}
        />
      </>
    );
  }

  if (route.name === 'case' || route.name === 'reveal') {
    const id = route.id;
    const caseDef = CASES.find((c) => c.id === id)!;
    const patch = patches[id];
    return (
      <>
        {top({
          cases: true,
          center: (
            <span className="topbar-case">
              <span style={{ color: caseDef.color }}>Case {caseDef.n}</span> {caseDef.nick}
            </span>
          ),
        })}
        {patch ? (
          <Playfield
            key={`${id}-${attempt}`}
            mode="case"
            patch={patch}
            caseDef={caseDef}
            onReveal={(mark, chips, gaveUp, peeked) => handleReveal(id, mark, chips, gaveUp, peeked)}
          />
        ) : (
          <main className="page"><p className="page-lead">Loading the photos…</p></main>
        )}
      </>
    );
  }

  if (route.name === 'report') {
    return (
      <>
        {top({ cases: true })}
        <FieldReport
          results={progress.results}
          heroPatch={patches.barnard ?? null}
          onExplore={goExplore}
          onReset={() => { resetProgress(); goBoard(); }}
        />
      </>
    );
  }

  // explore
  const req = route.req;
  const load = req ? loads[reqQuery(req)] : undefined;
  return (
    <>
      {top({ cases: true })}
      {req && load?.patch ? (
        <Playfield
          key={reqQuery(req)}
          mode="explore"
          patch={load.patch}
          onSaveObservation={saveObservation}
          explore={{ ra: req.ra, dec: req.dec, fovDeg: req.fovDeg, shareUrl: shareUrl(req) }}
          onNewSearch={goExplore}
        />
      ) : (
        <ExploreGate
          initialText={queryText}
          initialFov={req?.fovDeg ?? 0.1}
          loading={req && !load?.error ? load?.step ?? 'finding' : null}
          error={load?.error ?? null}
          onSearch={handleSearch}
          onTryCase={() => openCase(CASES.find((c) => !progress.results[c.id])?.id ?? 'barnard')}
        />
      )}
    </>
  );
}
