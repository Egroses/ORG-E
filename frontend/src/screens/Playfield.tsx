import { useEffect, useMemo, useRef, useState } from 'react';
import type { Chip, CompareMode, Detail, Pt, SkyPatch } from '../data/types';
import type { CaseDef, Tool } from '../data/catalog';
import { EPOCHS, KNOWN } from '../data/catalog';
import { SkyCanvas, type Ring } from '../components/SkyCanvas';
import { formatCoords, mjdToYear, pixelToSky, propagate, skyToPixel } from '../sky/astro';
import { answerKey, type AnswerKey } from '../sky/analysis';
import type { Observation } from '../state/progress';

type Tab = 'goggles' | 'detail' | 'compare';

const SHOW_COLOR = '#3DDC97';

/** Plain-language "what to watch" line for the shown answer, built from the computed answer key. */
function watchLine(key: AnswerKey): string {
  const parts: string[] = [];
  if (key.motionPx >= 1) {
    parts.push(`It shifts ${key.motionPx.toFixed(1)} pixels from photo 1 to photo 3. Watch the solid ring pull away from the dashed one.`);
  } else if (key.motionPx >= 0.4) {
    parts.push(`It shifts less than one pixel (${key.motionPx.toFixed(1)}). Watch which square of the grid is brightest.`);
  }
  if (key.accepted.includes('bright')) {
    const iMax = key.fluxes.indexOf(Math.max(...key.fluxes));
    const iMin = key.fluxes.indexOf(Math.min(...key.fluxes));
    parts.push(`${key.motionPx < 0.4 ? 'It stays in place, but its glow changes' : 'Its glow changes too'}: brightest in photo ${iMax + 1} (${EPOCHS[iMax].label}), dimmest in photo ${iMin + 1} (${EPOCHS[iMin].label}).`);
  }
  if (!parts.length) parts.push('Nothing clearly changes here. That is the answer.');
  return parts.join(' ');
}

const CHIPS: { id: Chip; name: string }[] = [
  { id: 'moved', name: 'Moved' },
  { id: 'bright', name: 'Brightness changed' },
  { id: 'noclear', name: 'No clear change' },
  { id: 'unsure', name: 'Unsure' },
];

const MODES: { id: CompareMode; name: string; sub: string }[] = [
  { id: 'blink', name: 'Flip photos', sub: 'Play the three dates in order, like a flip book.' },
  { id: 'diff', name: 'Changes only', sub: 'Subtracts the first photo. Light spots: where something is now. Teal: where it used to be.' },
  { id: 'stack', name: 'All photos added', sub: 'Adds the dates for a deeper look. Hides timing; movers smear.' },
];

const toolTab = (t: Tool | undefined): Tab => (t === 'detail' ? 'detail' : t === 'compare' ? 'compare' : 'goggles');

function TodoDot({ n, done }: { n: number; done: boolean }) {
  return (
    <>
      <span className="todo-dot" aria-hidden="true">
        {done ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
        ) : n}
      </span>
      {done && <span className="sr-only">Done: </span>}
    </>
  );
}

interface ExploreInfo {
  ra: number;
  dec: number;
  fovDeg: number;
  shareUrl: string;
}

interface Props {
  mode: 'case' | 'explore';
  patch: SkyPatch;
  caseDef?: CaseDef;
  /** peeked: the player saw the answer before checking, so the round counts as practice. */
  onReveal?: (mark: Pt | null, chips: Chip[], gaveUp: boolean, peeked: boolean) => void;
  onSaveObservation?: (o: Observation) => number;
  explore?: ExploreInfo;
  onNewSearch?: () => void;
}

export function Playfield({ mode, patch, caseDef, onReveal, onSaveObservation, explore, onNewSearch }: Props) {
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const startBand = caseDef ? Math.max(0, patch.bands.findIndex((b) => b.id === caseDef.startBand)) : 2;
  const [epoch, setEpoch] = useState(0);
  const [playing, setPlaying] = useState(!reduceMotion);
  const [band, setBand] = useState(startBand);
  const [detail, setDetail] = useState<Detail>('standard');
  const [magnify, setMagnify] = useState(false);
  const [grid, setGrid] = useState(false);
  const [invert, setInvert] = useState(false);
  const [compare, setCompare] = useState<CompareMode>('blink');
  const [showKnown, setShowKnown] = useState(true);
  const [mark, setMark] = useState<Pt | null>(null);
  const [chips, setChips] = useState<Chip[]>([]);
  const [tab, setTab] = useState<Tab>(toolTab(caseDef?.tool));
  const [saved, setSaved] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState<{ fromBand: number } | null>(null);
  const [ringsOn, setRingsOn] = useState(true);
  const [peeked, setPeeked] = useState(false);
  const [hint, setHint] = useState(false);
  const [seen, setSeen] = useState(1);
  const [stepDone, setStepDone] = useState(false);
  const skyRef = useRef<HTMLElement>(null);

  // Track which photos have been on screen (adjusting state during render, no effect needed).
  if (!(seen & (1 << epoch))) setSeen(seen | (1 << epoch));
  const firstStepMet = !!caseDef && (
    caseDef.check === 'seen' ? (seen | (1 << epoch)) === 0b111
      : caseDef.check === 'long' ? patch.bands[band].id === 'D6'
        : caseDef.check === 'detail' ? magnify && grid
          : compare === 'diff');
  if (firstStepMet && !stepDone) setStepDone(true);

  const key = useMemo(() => (mode === 'case' && caseDef ? answerKey(patch, KNOWN[caseDef.id]) : null), [mode, caseDef, patch]);

  function showAnswer() {
    if (!key) return;
    const best = Math.max(0, patch.bands.findIndex((b) => b.id === key.bestBand));
    setShown({ fromBand: band });
    setBand(best);
    setCompare('blink');
    setDetail('standard');
    setInvert(false);
    setMagnify(true);
    if (key.motionPx >= 0.4 && key.motionPx < 1) setGrid(true);
    setRingsOn(true);
    setEpoch(0);
    setPlaying(!reduceMotion);
    // On phones the sky sits above the button; bring it back into view.
    skyRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  }

  function hideAnswer() {
    setShown(null);
    setPeeked(true);
    setMagnify(false);
  }

  const cycling = playing && compare !== 'stack';
  useEffect(() => {
    if (!cycling) return;
    const id = window.setInterval(() => setEpoch((e) => (e + 1) % EPOCHS.length), 900);
    return () => window.clearInterval(id);
  }, [cycling]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === 'ArrowRight') {
        setPlaying(false);
        setEpoch((v) => (v + 1) % EPOCHS.length);
      } else if (e.key === 'ArrowLeft') {
        setPlaying(false);
        setEpoch((v) => (v + EPOCHS.length - 1) % EPOCHS.length);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // In explore mode, show catalogued objects in the field as context (never as validation).
  const knownRings = useMemo<{ rings: Ring[]; paths: Pt[][] }>(() => {
    if (mode !== 'explore') return { rings: [], paths: [] };
    const rings: Ring[] = [];
    const paths: Pt[][] = [];
    for (const obj of Object.values(KNOWN)) {
      const pts = EPOCHS.map((ep) => {
        const p = propagate(obj, mjdToYear(ep.mjd));
        return skyToPixel(patch, p.ra, p.dec);
      });
      const inside = pts.some((p) => p.x >= 0 && p.y >= 0 && p.x < patch.size && p.y < patch.size);
      if (!inside) continue;
      rings.push({ ...pts[epoch], color: '#B59CFF', r: 3, label: obj.name });
      paths.push(pts);
    }
    return { rings, paths };
  }, [mode, patch, epoch]);

  // After "I can't find it": a solid ring where the object is in this photo, a dashed ring where it was in photo 1.
  const shownRings = useMemo<Ring[]>(() => {
    if (!shown || !key || !ringsOn || !caseDef) return [];
    const now = key.positions[compare === 'stack' ? 1 : epoch];
    const rings: Ring[] = [];
    if (key.motionPx >= 0.4) rings.push({ ...key.positions[0], color: SHOW_COLOR, r: 2.4, dashed: true });
    rings.push({ ...now, color: SHOW_COLOR, r: 3.6, label: KNOWN[caseDef.id].name });
    return rings;
  }, [shown, key, ringsOn, caseDef, compare, epoch]);

  // "Give me a hint": a wide circle around the area, deliberately not centred on the object.
  const hintRings = useMemo<Ring[]>(() => {
    if (!hint || shown || !key) return [];
    const p = key.positions[1];
    return [{ x: p.x + 2.2, y: p.y - 1.6, color: '#C9B6FF', r: 7, dashed: true }];
  }, [hint, shown, key]);

  const toggleChip = (id: Chip) => setChips((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const canReveal = !!mark || chips.length > 0;
  const bandObj = patch.bands[band];
  const ep = EPOCHS[epoch];
  const newTool = caseDef && caseDef.tool !== 'flip' ? toolTab(caseDef.tool) : null;

  function saveObservation() {
    if (!mark || !onSaveObservation) return;
    const sky = pixelToSky(patch, mark.x, mark.y);
    const n = onSaveObservation({
      ra: sky.ra, dec: sky.dec, epoch: ep.label, band: bandObj.label, chips, savedAt: new Date().toISOString(),
    });
    setSaved(n);
  }

  async function copyLink() {
    if (!explore) return;
    try {
      await navigator.clipboard.writeText(explore.shareUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="play">
      <section ref={skyRef} className="sky-col" aria-label="Sky">
        <SkyCanvas
          className="sky-main"
          patch={patch}
          epoch={epoch}
          band={band}
          mode={compare}
          detail={detail}
          invert={invert}
          magnify={magnify}
          grid={grid}
          mark={mark}
          rings={mode === 'case' ? (shown ? shownRings : hintRings) : showKnown ? knownRings.rings : []}
          path={shown && key ? (ringsOn && key.motionPx >= 0.4 ? key.positions : undefined)
            : showKnown && knownRings.paths.length ? knownRings.paths[0] : undefined}
          pathColor={shown ? SHOW_COLOR : undefined}
          focus={shown && key ? key.positions[1] : null}
          onTap={shown ? undefined : (p) => { setMark(p); setSaved(null); }}
          tapLabel="Sky photo. Tap where something changed."
        >
          <span className="sky-chip sky-chip-left">
            {compare === 'stack' ? 'All three photos added' : `Photo ${epoch + 1} of 3, ${ep.label}`}
            {compare === 'diff' && ' minus photo 1'}
          </span>
          <span className="sky-chip sky-chip-right" style={{ background: bandObj.color }}>Goggles: {bandObj.label}</span>
          {patch.source === 'mock' && <span className="sky-chip sky-chip-bottom">Demo data</span>}
        </SkyCanvas>
        <div className="sky-controls">
          <button type="button" className="btn btn-primary btn-play" onClick={() => setPlaying((p) => !p)} disabled={compare === 'stack'}>
            {cycling ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.5" /><rect x="14" y="5" width="4" height="14" rx="1.5" /></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
            )}
            {cycling ? 'Pause' : 'Flip'}
          </button>
          <div className="stones" role="group" aria-label="Photos">
            {EPOCHS.map((e, i) => (
              <button
                key={e.index}
                type="button"
                className={`stone${i === epoch ? ' on' : ''}`}
                aria-pressed={i === epoch}
                onClick={() => { setEpoch(i); setPlaying(false); }}
              >
                <span className="stone-name">{e.label}</span>
                <span className="stone-sub">Photo {i + 1}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <aside className="dock" aria-label={mode === 'case' ? 'Answer and tools' : 'Observation and tools'}>
        {mode === 'case' && caseDef && shown && key && (
          <section className="card paper answer" aria-live="polite">
            <span className="badge show">Here it is</span>
            <h2 className="answer-title">{KNOWN[caseDef.id].name}</h2>
            <p className="answer-fact">{KNOWN[caseDef.id].fact}</p>
            <p className="answer-watch">{watchLine(key)}</p>
            {patch.bands[shown.fromBand].id !== key.bestBand && (
              <p className="answer-note">
                Goggles switched to {bandObj.label}, where it shows best.
                {KNOWN[caseDef.id].snr[patch.bands[shown.fromBand].id] < 3 && ` At ${patch.bands[shown.fromBand].label} it barely shows at all.`}
              </p>
            )}
            {ringsOn && (
              <ul className="show-legend">
                <li><span className="legend-swatch"><span className="legend-ring" /></span>Where it is in this photo</li>
                {key.motionPx >= 0.4 && <li><span className="legend-swatch"><span className="legend-ring dashed" /></span>Where it was in photo 1</li>}
              </ul>
            )}
            <button type="button" className="btn btn-primary btn-wide" onClick={hideAnswer}>
              Hide it and try myself
            </button>
            <div className="answer-help">
              <button type="button" className="btn-link" onClick={() => setRingsOn((v) => !v)}>
                {ringsOn ? 'Turn rings off' : 'Turn rings on'}
              </button>
              <button type="button" className="btn-link" onClick={() => onReveal?.(null, [], true, true)}>See the full answer</button>
            </div>
          </section>
        )}

        {mode === 'case' && caseDef && !shown && (
          <section className="card paper answer">
            <p className="answer-goal">{caseDef.goal}</p>
            <ol className="todo">
              <li className={stepDone ? 'done' : ''}>
                <TodoDot n={1} done={stepDone} />
                <span>{caseDef.step}</span>
              </li>
              <li className={mark ? 'done' : ''}>
                <TodoDot n={2} done={!!mark} />
                <span>{mark ? 'Marked. Tap again to move your mark.' : 'Tap that dot on the photo.'}</span>
              </li>
              <li className={chips.length ? 'done' : ''}>
                <TodoDot n={3} done={chips.length > 0} />
                <div className="todo-body">
                  <span>What did it do?</span>
                  <div className="chips" role="group" aria-label="What did it do?">
                    {CHIPS.map((c) => (
                      <button key={c.id} type="button" className={`chip${chips.includes(c.id) ? ' on' : ''}`} aria-pressed={chips.includes(c.id)} onClick={() => toggleChip(c.id)}>
                        {chips.includes(c.id) && (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
                        )}
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            </ol>
            {hint && <p className="answer-hint-on" role="status">Hint: it is inside the large purple circle.</p>}
            {peeked && <p className="answer-note">You have seen the answer, so this round is practice.</p>}
            <button type="button" className="btn btn-primary btn-wide" disabled={!canReveal} onClick={() => onReveal?.(mark, chips, false, peeked)}>
              Check the catalog
            </button>
            <div className="answer-help">
              <button type="button" className="btn-link" disabled={hint} onClick={() => setHint(true)}>{hint ? 'Hint shown' : 'Give me a hint'}</button>
              <button type="button" className="btn-link" onClick={showAnswer}>I can’t find it, show me</button>
            </div>
          </section>
        )}

        {mode === 'explore' && explore && (
          <section className="card paper answer">
            <div className="explore-head">
              <div>
                <h2 className="answer-title">Exploring</h2>
                <p className="explore-coords">{formatCoords(explore.ra, explore.dec)}, {explore.fovDeg}° wide</p>
              </div>
              <button type="button" className="btn-link" onClick={onNewSearch}>New spot</button>
            </div>
            <p className="answer-hint">{mark ? 'Marked. What did it do?' : 'Tap anything that changes between photos.'}</p>
            <div className="chips" role="group" aria-label="What did it do?">
              {CHIPS.map((c) => (
                <button key={c.id} type="button" className={`chip${chips.includes(c.id) ? ' on' : ''}`} aria-pressed={chips.includes(c.id)} onClick={() => toggleChip(c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
            <div className="explore-actions">
              <button type="button" className="btn btn-primary" disabled={!mark} onClick={saveObservation}>Save observation</button>
              <button type="button" className="btn btn-paper" onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
            </div>
            <p className="answer-note" role="status">
              {saved != null
                ? `Saved as an unverified observation. ${saved} saved on this device.`
                : 'Observations are saved as unverified notes, not discoveries.'}
            </p>
          </section>
        )}

        <section className="card tools">
          <div className="tabs" role="tablist" aria-label="Tools">
            {(['goggles', 'detail', 'compare'] as Tab[]).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
                {t === 'goggles' ? 'Goggles' : t === 'detail' ? 'Detail' : 'Compare'}
                {newTool === t && <span className="new-badge">New</span>}
              </button>
            ))}
          </div>

          {tab === 'goggles' && (
            <div className="tool-body" role="tabpanel">
              <p className="tool-lead">Infrared goggles: different wavelengths reveal different light.</p>
              <div className="stops" role="radiogroup" aria-label="Wavelength">
                {patch.bands.map((b, i) => (
                  <button
                    key={b.id}
                    type="button"
                    role="radio"
                    aria-checked={i === band}
                    className={`stop${i === band ? ' on' : ''}`}
                    style={i === band ? { background: b.color } : undefined}
                    onClick={() => setBand(i)}
                  >
                    <span className="stop-label">{b.label}</span>
                    <span className="stop-name">{b.name}</span>
                  </button>
                ))}
              </div>
              <p className="tool-note">Switch wavelengths. What gets easier to see?</p>
            </div>
          )}

          {tab === 'detail' && (
            <div className="tool-body" role="tabpanel">
              <div className="seg">
                {(['standard', 'faint'] as Detail[]).map((d) => (
                  <button key={d} type="button" aria-pressed={detail === d} className={`seg-btn${detail === d ? ' on' : ''}`} onClick={() => setDetail(d)}>
                    {d === 'standard' ? 'Standard' : 'Faint detail'}
                  </button>
                ))}
              </div>
              <div className="seg">
                <button type="button" aria-pressed={magnify} className={`seg-btn${magnify ? ' on' : ''}`} onClick={() => setMagnify((m) => !m)}>Magnifier</button>
                <button type="button" aria-pressed={grid} className={`seg-btn${grid ? ' on' : ''}`} onClick={() => setGrid((g) => !g)}>Pixel grid</button>
              </div>
              <div className="seg">
                <button type="button" aria-pressed={invert} className={`seg-btn${invert ? ' on' : ''}`} onClick={() => setInvert((v) => !v)}>Dark on light</button>
                {mode === 'explore' && (
                  <button type="button" aria-pressed={showKnown} className={`seg-btn${showKnown ? ' on' : ''}`} onClick={() => setShowKnown((v) => !v)}>Known objects</button>
                )}
              </div>
              <p className="tool-note">Magnifier makes pixels bigger. It cannot add detail that was never there. Every photo uses the same brightness scale.</p>
            </div>
          )}

          {tab === 'compare' && (
            <div className="tool-body" role="tabpanel">
              <div className="modes" role="radiogroup" aria-label="How to compare photos">
                {MODES.map((m) => (
                  <button key={m.id} type="button" role="radio" aria-checked={compare === m.id} className={`mode${compare === m.id ? ' on' : ''}`} onClick={() => setCompare(m.id)}>
                    <span className="mode-name">{m.name}</span>
                    <span className="mode-sub">{m.sub}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
