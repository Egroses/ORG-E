import { useEffect, useMemo, useRef, useState } from 'react';
import type { Chip, CompareMode, Detail, Epoch, Pt, SkyPatch } from '../data/types';
import type { CaseDef } from '../data/catalog';
import { KNOWN } from '../data/catalog';
import { SkyCanvas, type Arrow, type Ring } from '../components/SkyCanvas';
import { ObservationMap } from '../components/ObservationMap';
import { MeasureCard } from '../components/MeasureCard';
import { ChangesList } from '../components/ChangesList';
import { Icon } from '../components/Icon';
import { formatCoords, pixelToSky } from '../sky/astro';
import { answerKey, type AnswerKey } from '../sky/analysis';
import { measureBest } from '../sky/measure';
import { checkCatalogue, sourcePixels, verdictText, type CatalogueSource } from '../sky/catalogue';
import { num, t as tNow } from '../i18n';
import { useI18n } from '../i18n/react';
import { Rich } from '../components/Term';
import { findChanges, type FieldChange } from '../sky/changes';
import type { StretchFn } from '../sky/render';
import { useCatalogue } from '../data/useCatalogue';
import { wiseMarks } from '../sky/wiseMarks';
import { savedCopyText } from '../data/staticProvider';
import { mjdToDateText, pct1 } from '../lib/format';
import type { Candidate, Observation } from '../state/progress';

const SHOW_COLOR = '#3DDC97';
const MEASURE_COLOR = '#22d3ee';
const GAIA_COLOR = '#7fdbff';
const KNOWN_COLOR = '#ffb347';
const HINT_COLOR = '#ffd166';

/** Plain-language "what to watch" line for the shown answer, built from the computed answer key. */
function watchLine(key: AnswerKey, epochs: Epoch[]): string {
  const parts: string[] = [];
  const last = epochs.length;
  if (key.motionPx >= 1) {
    parts.push(tNow('watch.shifts', { px: num(key.motionPx, 1), last }));
  } else if (key.motionPx >= 0.4) {
    parts.push(tNow('watch.shiftsLess', { px: num(key.motionPx, 1) }));
  }
  if (key.accepted.includes('bright')) {
    const iMax = key.fluxes.indexOf(Math.max(...key.fluxes));
    const iMin = key.fluxes.indexOf(Math.min(...key.fluxes));
    parts.push(tNow(key.motionPx < 0.4 ? 'watch.glowStays' : 'watch.glowAlso', { max: iMax + 1, maxLabel: epochs[iMax].label, min: iMin + 1, minLabel: epochs[iMin].label }));
  }
  if (!parts.length) parts.push(tNow('watch.nothing'));
  return parts.join(' ');
}

const CHIPS: { id: Chip }[] = [{ id: 'moved' }, { id: 'bright' }, { id: 'noclear' }, { id: 'unsure' }];
const MODES: CompareMode[] = ['blink', 'diff', 'stack'];
const STRETCHES: Exclude<StretchFn, 'log'>[] = ['asinh', 'sqrt', 'linear'];
const SPEEDS = [0.5, 1, 2];

type Sheet = 'find' | 'layers' | 'map';

function TodoDot({ n, done }: { n: number; done: boolean }) {
  return (
    <>
      <span className="todo-dot" aria-hidden="true">{done ? <Icon name="check" size={12} /> : n}</span>
      {done && <span className="sr-only">{tNow('pf.done')} </span>}
    </>
  );
}

interface ExploreInfo {
  ra: number;
  dec: number;
  fovDeg: number;
}

interface Props {
  mode: 'case' | 'explore';
  patch: SkyPatch;
  caseDef?: CaseDef;
  /** peeked: the player saw the answer before checking, so the round counts as practice. */
  onReveal?: (mark: Pt | null, chips: Chip[], gaveUp: boolean, peeked: boolean) => void;
  onSaveObservation?: (o: Observation) => number;
  onSaveCandidate?: (c: Omit<Candidate, 'id' | 'savedAt'>) => void;
  explore?: ExploreInfo;
}

/** Share of flagged pixels, in the whole field or inside a circle around a point. */
function flaggedShare(flags: Uint8Array, size: number, around?: Pt, radius = 2.5): number {
  let n = 0, f = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (around && Math.hypot(x - around.x, y - around.y) > radius) continue;
      n++;
      if (flags[y * size + x]) f++;
    }
  }
  return n ? f / n : 0;
}

export function Playfield({ mode, patch, caseDef, onReveal, onSaveObservation, onSaveCandidate, explore }: Props) {
  const { t, tp, lang } = useI18n();
  const measuredLabel = t('rings.measured');
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const eps = patch.epochs;
  const nEp = eps.length;
  const mid = Math.floor(nEp / 2);
  const startBand = caseDef ? Math.max(0, patch.bands.findIndex((b) => b.id === caseDef.startBand)) : patch.bands.length - 1;
  const [epoch, setEpoch] = useState(0);
  const [playing, setPlaying] = useState(!reduceMotion);
  const [axis, setAxis] = useState<'epochs' | 'bands'>('epochs');
  const [speed, setSpeed] = useState(1);
  const [band, setBand] = useState(startBand);
  const [detail, setDetail] = useState<Detail>('standard');
  const [magnify, setMagnify] = useState(false);
  const [grid, setGrid] = useState(false);
  const [invert, setInvert] = useState(false);
  const [showFlags, setShowFlags] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [stretch, setStretch] = useState<StretchFn>('asinh');
  const [compare, setCompare] = useState<CompareMode>('blink');
  const [showKnown, setShowKnown] = useState(true);
  const [showWise, setShowWise] = useState(false);
  const [mark, setMark] = useState<Pt | null>(null);
  const [chips, setChips] = useState<Chip[]>([]);
  const [sheet, setSheet] = useState<Sheet>('find');
  const [saved, setSaved] = useState<number | null>(null);
  const [candSaved, setCandSaved] = useState(false);
  const [shown, setShown] = useState<{ fromBand: number } | null>(null);
  const [ringsOn, setRingsOn] = useState(true);
  const [peeked, setPeeked] = useState(false);
  const [hint, setHint] = useState(false);
  const [seen, setSeen] = useState(1);
  const [stepDone, setStepDone] = useState(false);
  const [focusPt, setFocusPt] = useState<Pt | null>(null);
  const skyRef = useRef<HTMLDivElement>(null);

  // Track which photos have been on screen (adjusting state during render, no effect needed).
  if (!(seen & (1 << epoch))) setSeen(seen | (1 << epoch));
  const allSeen = (1 << nEp) - 1;
  const firstStepMet = !!caseDef && (
    caseDef.check === 'seen' ? (seen | (1 << epoch)) === allSeen
      : caseDef.check === 'long' ? patch.bands[band].id === 'D6'
        : caseDef.check === 'detail' ? magnify && grid
          : compare === 'diff');
  if (firstStepMet && !stepDone) setStepDone(true);

  const key = useMemo(() => (mode === 'case' && caseDef ? answerKey(patch, KNOWN[caseDef.id]) : null), [mode, caseDef, patch]);

  const measurement = useMemo(() => (mark ? measureBest(patch, mark) : null), [mark, patch]);
  const catalogue = useCatalogue(patch, mode === 'explore', mode === 'explore');
  const verdictSources = useMemo(() => [...catalogue.sources, ...catalogue.wise.sources], [catalogue.sources, catalogue.wise.sources]);
  const wise = useMemo(() => (mode === 'explore' ? wiseMarks(patch, epoch, catalogue.wise.sources) : { rings: [] as Ring[], arrows: [] as Arrow[], inView: [] }), [mode, patch, epoch, catalogue.wise.sources]);
  const verdict = useMemo(
    () => (mode === 'explore' && measurement ? checkCatalogue(patch, measurement, verdictSources) : undefined),
    [mode, measurement, patch, verdictSources],
  );
  const changes = useMemo(() => (mode === 'explore' ? findChanges(patch, band) : null), [mode, patch, band]);

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
    setAxis('epochs');
    setPlaying(!reduceMotion);
    skyRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  }

  function hideAnswer() {
    setShown(null);
    setPeeked(true);
    setMagnify(false);
  }

  const nBands = patch.bands.length;
  const cycling = playing && compare !== 'stack';
  useEffect(() => {
    if (!cycling) return;
    const id = window.setInterval(() => {
      if (axis === 'epochs') setEpoch((e) => (e + 1) % nEp);
      else setBand((b) => (b + 1) % nBands);
    }, 1000 / speed);
    return () => window.clearInterval(id);
  }, [cycling, nEp, nBands, axis, speed]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
      const step = (d: number) => {
        setPlaying(false);
        if (axis === 'epochs') setEpoch((v) => (v + d + nEp) % nEp);
        else setBand((v) => (v + d + nBands) % nBands);
      };
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nEp, nBands, axis]);

  // In explore mode, catalogue marks follow their stars from visit to visit (context, never validation).
  // At most 20 marks are drawn and the labels are placed so that none overlap.
  const catalogueMarks = useMemo<{ rings: Ring[]; paths: Pt[][]; total: number }>(() => {
    if (mode !== 'explore') return { rings: [], paths: [], total: 0 };
    const rings: Ring[] = [];
    const paths: Pt[][] = [];
    const list: CatalogueSource[] = [...catalogue.sources].sort((a, b) => Number(b.origin === 'known') - Number(a.origin === 'known') || (a.gmag ?? 99) - (b.gmag ?? 99));
    let total = 0;
    for (const s of list) {
      const pts = sourcePixels(patch, s);
      const inside = pts.some((p) => p.x >= 0 && p.y >= 0 && p.x < patch.size && p.y < patch.size);
      if (!inside) continue;
      total++;
      if (rings.length >= 20) continue;
      const p = pts[epoch];
      rings.push({
        x: p.x, y: p.y, color: s.origin === 'known' ? KNOWN_COLOR : GAIA_COLOR, r: 2.6 * (6.15 / patch.pixelScale) / 2 + 1,
        label: s.origin === 'known' ? s.name : s.gmag != null ? `G ${num(s.gmag, 1, lang)}` : undefined,
      });
      if (Math.hypot(pts[nEp - 1].x - pts[0].x, pts[nEp - 1].y - pts[0].y) * patch.pixelScale > 4) paths.push(pts);
    }
    return { rings, paths, total };
  }, [mode, patch, epoch, catalogue.sources, nEp, lang]);

  // After "I can't find it": a solid ring where the object is in this photo, a dashed ring where it was in photo 1.
  const shownRings = useMemo<Ring[]>(() => {
    if (!shown || !key || !ringsOn || !caseDef) return [];
    const now = key.positions[compare === 'stack' ? mid : epoch];
    const rings: Ring[] = [];
    const k = 6.15 / patch.pixelScale;
    rings.push({ ...now, color: SHOW_COLOR, r: 3.6 * k, label: KNOWN[caseDef.id].name });
    if (key.motionPx >= 0.4) rings.push({ ...key.positions[0], color: SHOW_COLOR, r: 2.4 * k, dashed: true });
    return rings;
  }, [shown, key, ringsOn, caseDef, compare, epoch, mid, patch.pixelScale]);

  // "Give me a hint": a wide circle around the area, deliberately not centred on the object.
  const hintRings = useMemo<Ring[]>(() => {
    if (!hint || shown || !key) return [];
    const p = key.positions[mid];
    const k = 6.15 / patch.pixelScale;
    return [{ x: p.x + 2.2 * k, y: p.y - 1.6 * k, color: HINT_COLOR, r: 7 * k, dashed: true }];
  }, [hint, shown, key, mid, patch.pixelScale]);

  // The player's measured centre, in the photo on screen.
  const measureRings = useMemo<Ring[]>(() => {
    if (!measurement || measurement.status !== 'ok') return [];
    const p = measurement.points.find((q) => q.epoch === epoch);
    return p ? [{ x: p.x, y: p.y, color: MEASURE_COLOR, r: 2.2 * (6.15 / patch.pixelScale) / 2 + 0.8, label: measuredLabel }] : [];
  }, [measurement, epoch, patch.pixelScale, measuredLabel]);

  const toggleChip = (id: Chip) => setChips((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const canReveal = !!mark || chips.length > 0;
  const bandObj = patch.bands[band];
  const ep = eps[epoch];
  const missingHere = !!patch.missing?.[epoch]?.[band];
  const countHere = patch.imageCounts?.[epoch]?.[band] ?? ep.imageCount;

  const fieldFlag = useMemo(() => (missingHere ? null : flaggedShare(patch.flags[epoch][band], patch.size)), [patch, epoch, band, missingHere]);
  const markFlag = useMemo(
    () => (mark && !missingHere ? flaggedShare(patch.flags[epoch][band], patch.size, mark, 15 / patch.pixelScale) : null),
    [patch, epoch, band, mark, missingHere],
  );
  const totalExposures = patch.imageCounts ? patch.imageCounts.flat().reduce((s, n) => s + n, 0) : eps.reduce((s, e) => s + e.imageCount, 0);

  function saveObservation() {
    if (!mark || !onSaveObservation) return;
    const sky = pixelToSky(patch, mark.x, mark.y);
    const n = onSaveObservation({
      ra: sky.ra, dec: sky.dec, epoch: ep.label, band: bandObj.label, chips, savedAt: new Date().toISOString(),
    });
    setSaved(n);
  }

  function saveCandidate() {
    if (!measurement || measurement.status !== 'ok' || !onSaveCandidate) return;
    const last = measurement.points[measurement.points.length - 1];
    onSaveCandidate({
      ra: last.ra, dec: last.dec, shiftArcsec: measurement.shiftArcsec, rateArcsecPerYear: measurement.rate,
      verdict: verdict ? verdictText(verdict) : '', band: patch.bands[measurement.band].label, note: '',
      verdictKind: verdict?.kind, verdictMoves: verdict?.moves ?? null, verdictRate: verdict?.catRate ?? null,
      verdictSource: verdict?.source ? { name: verdict.source.name, origin: verdict.source.origin, gmag: verdict.source.gmag } : null,
    });
    setCandSaved(true);
  }

  function pickChange(c: FieldChange) {
    setFocusPt({ x: c.x, y: c.y });
    setMark({ x: c.x, y: c.y });
    setMagnify(true);
    setCandSaved(false);
    skyRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  }

  const marks = mode === 'case' ? (shown ? shownRings : [...measureRings, ...hintRings]) : [...measureRings, ...(showKnown ? catalogueMarks.rings : []), ...(showWise ? wise.rings : [])];

  // Timeline: visits placed by their mid-date, to scale.
  const mjds = eps.map((e) => e.mjd);
  const lo = Math.min(...mjds), hi = Math.max(...mjds);
  const place = (m: number) => (hi > lo ? 6 + ((m - lo) / (hi - lo)) * 88 : 50);

  const sheetTabs: { id: Sheet; name: string }[] = [
    { id: 'find', name: t('r.tabs.find') },
    { id: 'layers', name: t('r.tabs.layers') },
    { id: 'map', name: t('r.tabs.map') },
  ];

  return (
    <main className="tool" data-view="game" data-sheet={sheet}>
      {/* ---------- navigator ---------- */}
      <aside className="panel nav-panel" aria-label={t('r.bandsAndVisits')}>
        <ObservationMap
          patch={patch}
          epoch={epoch}
          band={band}
          onPick={(e, b) => { setEpoch(e); setBand(b); setPlaying(false); }}
          onBand={(b) => setBand(b)}
        />
        <hr className="div" />
        <div className="row between">
          <span className="t-label">{t('r.stepThrough')}</span>
          <div className="seg" role="group" aria-label={t('r.stepThrough')}>
            <button type="button" aria-pressed={axis === 'epochs'} onClick={() => setAxis('epochs')}>{t('pf.epochs')}</button>
            <button type="button" aria-pressed={axis === 'bands'} onClick={() => setAxis('bands')}>{t('r.stepBands')}</button>
          </div>
        </div>
        <p className="t-caption c-3">{t(axis === 'epochs' ? 'pf.stepHelpEpochs' : 'pf.stepHelpBands')}</p>
        <hr className="div" />
        <h2 className="t-label">{t('r.shownNow')}</h2>
        <dl className="facts">
          <dt>{t('pf.shown.visit')}</dt><dd>{t('r.visitOf', { label: ep.label, i: epoch + 1, n: nEp })}</dd>
          <dt>{t('r.shown.window')}</dt><dd>{ep.dates}</dd>
          <dt>{t('r.shown.mid')}</dt><dd>{mjdToDateText(ep.mjd)}</dd>
          <dt>{t('r.shown.band')}</dt><dd>{bandObj.name}, {num(bandObj.rangeUm[0], 2)}–{num(bandObj.rangeUm[1], 2)} µm</dd>
          <dt>{t('r.shown.exposures')}</dt><dd>{missingHere ? t('r.noExposures') : countHere}</dd>
          <dt>{t('pf.shown.noise')}</dt><dd>{t('r.noiseRef', { v: num(patch.noise[epoch][band], 2) })}</dd>
          <dt>{t('r.shown.flagged')}</dt><dd>{fieldFlag === null ? t('common.na') : t('pf.ofField', { v: pct1(fieldFlag) })}</dd>
        </dl>
      </aside>

      {/* ---------- centre: picture, timeline, layers ---------- */}
      <div className="center">
        <div className="stage-slot" ref={skyRef}>
          <SkyCanvas
            chrome
            className="sky-main"
            patch={patch}
            epoch={epoch}
            band={band}
            mode={compare}
            detail={detail}
            invert={invert}
            magnify={magnify}
            grid={grid}
            showFlags={showFlags}
            brightness={brightness}
            contrast={contrast}
            stretch={stretch}
            mark={mark}
            rings={marks}
            arrows={mode === 'explore' && showWise ? wise.arrows : undefined}
            path={shown && key ? (ringsOn && key.motionPx >= 0.4 ? key.positions : undefined)
              : mode === 'explore' && showKnown && catalogueMarks.paths.length ? catalogueMarks.paths[0] : undefined}
            pathColor={shown ? SHOW_COLOR : undefined}
            focus={shown && key ? key.positions[mid] : focusPt}
            onTap={shown ? undefined : (p) => { setMark(p); setSaved(null); setCandSaved(false); setFocusPt(null); }}
            tapLabel={t('pf.tapLabel')}
          >
            <div className="sky-lab">
              <b>{compare === 'stack' ? t('pf.allAdded') : ep.label}</b>
              <span>
                {compare === 'stack' ? tp('map.exposures', totalExposures) : missingHere ? t('pf.noExposuresBand') : tp('map.exposures', countHere)}
                {compare === 'diff' ? ` · ${t('pf.minusFirst')}` : ''}
              </span>
              <span>{compare === 'stack' ? t('pf.allVisits') : ep.dates}</span>
            </div>
            <span className="sky-band" style={{ borderColor: bandObj.color }}><i style={{ background: bandObj.color }} />{bandObj.name} {bandObj.label}</span>
            {savedCopyText(patch) && <span className="sky-chip sky-chip-bottom sky-chip-saved" role="status">{savedCopyText(patch)}</span>}
            {missingHere && <span className="sky-chip sky-chip-nodata">{t('pf.noPhotoBand')}</span>}
          </SkyCanvas>
        </div>

        <div className="bar timeline">
          <button type="button" className="playbtn" onClick={() => setPlaying((p) => !p)} disabled={compare === 'stack'} aria-label={cycling ? t('r.pause') : t('r.play')}>
            <Icon name={cycling ? 'pause' : 'play'} size={16} />
          </button>
          <div className="track" role="group" aria-label={t('r.visitsByDate')}>
            {eps.map((e, i) => {
              const left = place(e.mjd);
              const crowded = eps.some((o, j) => j !== i && Math.abs(place(o.mjd) - left) < 14);
              return (
                <button
                  key={e.index}
                  type="button"
                  className={`stop${crowded ? ' tight' : ''}`}
                  style={{ left: `${left}%` }}
                  aria-pressed={i === epoch}
                  title={`${e.label}: ${e.dates}`}
                  onClick={() => { setEpoch(i); setAxis('epochs'); setPlaying(false); }}
                >
                  <i /><span>{e.label}</span>
                </button>
              );
            })}
          </div>
          <div className="seg" role="group" aria-label={t('r.compareMode')}>
            {MODES.map((m) => (
              <button key={m} type="button" aria-pressed={compare === m} title={t(`pf.mode.${m}.sub`)} onClick={() => setCompare(m)}>{t(`pf.mode.${m}.name`)}</button>
            ))}
          </div>
          <select className="select select-sm" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label={t('r.speedLabel')}>
            {SPEEDS.map((s) => <option key={s} value={s}>{t('r.fps', { v: num(s, Number.isInteger(s) ? 0 : 1) })}</option>)}
          </select>
        </div>
        <p className="mode-note t-caption c-3">
          <b>{t(`pf.mode.${compare}.name`)}.</b> {t(`pf.mode.${compare}.sub`)} {t('pf.byDate')}
        </p>

        <div className="sheet-tabs seg" role="tablist" aria-label={t('r.panels')}>
          {sheetTabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={sheet === t.id} aria-pressed={sheet === t.id} onClick={() => setSheet(t.id)}>{t.name}</button>
          ))}
        </div>

        <div className="bar viewrow" aria-label={t('pf.layersDisplay')}>
          <div className="layers" role="group" aria-label={t('r.layersGroup')}>
            {mode === 'explore' && (
              <button type="button" className="layer" aria-pressed={showKnown} onClick={() => setShowKnown((v) => !v)} title={t('pf.catMarksTitle')}>
                <i className="mk gaia" />{t('r.catalogueMarks')}
              </button>
            )}
            {mode === 'explore' && (
              <button type="button" className="layer" aria-pressed={showWise} onClick={() => setShowWise((v) => !v)} title={t('sui.catWiseTitle')}>
                <i className="mk wise" />{t('sui.catWise')}
              </button>
            )}
            <button type="button" className="layer" aria-pressed={showFlags} onClick={() => setShowFlags((v) => !v)} title={t('pf.flagsTitle')}>
              <i className="mk flags" />{t('pf.flags')}
            </button>
            <button type="button" className="layer" aria-pressed={grid} onClick={() => setGrid((g) => !g)}>{t('r.grid')}</button>
            <button type="button" className="layer" aria-pressed={magnify} onClick={() => setMagnify((m) => !m)} title={t('pf.magTitle')}>{t('r.magnifier')}</button>
            <button type="button" className="layer" aria-pressed={detail === 'faint'} onClick={() => setDetail((d) => (d === 'faint' ? 'standard' : 'faint'))}>{t('pf.faint')}</button>
            <button type="button" className="layer" aria-pressed={invert} onClick={() => setInvert((v) => !v)}>{t('r.invert')}</button>
          </div>
          <div className="sliders">
            <label>{t('pf.brightness')}<input type="range" min="0.5" max="2" step="0.05" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} /><output>{num(brightness, 2)}</output></label>
            <label>{t('pf.contrast')}<input type="range" min="0.5" max="2.5" step="0.05" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} /><output>{num(contrast, 2)}</output></label>
            <label>{t('r.stretchTitle')}
              <select className="select select-sm" value={stretch} onChange={(e) => setStretch(e.target.value as StretchFn)}>
                {STRETCHES.map((s) => <option key={s} value={s}>{t(`pf.stretch.${s}`)}</option>)}
              </select>
            </label>
          </div>
          <p className="t-caption c-3 layer-note">
            {t('pf.sameScale')}
            {mode === 'explore' && showKnown && (
              <>
                {' '}<i className="mk gaia" /> {t('pf.legendGaia')}, <i className="mk known" /> {t('pf.legendKnown')}.
                {catalogueMarks.total > catalogueMarks.rings.length && ` ${t('r.showingBrightest', { n: catalogueMarks.rings.length, total: catalogueMarks.total })}`}
                {catalogue.status === 'unavailable' && ` ${t('pf.gaiaDown')}`}
              </>
            )}
            {mode === 'explore' && showWise && (
              <>
                {' '}<i className="mk wise" /> {t('sui.legendWise')}. {t('sui.wiseHelp')}
                {catalogue.wise.status === 'archive' && ` ${t('sui.wiseArchive')}`}
                {catalogue.wise.status === 'unreachable' && ` ${t('sui.wiseDown')}`}
              </>
            )}
            {showFlags && ` ${t('pf.magenta')}`}
          </p>
        </div>
      </div>

      {/* ---------- findings ---------- */}
      <aside className="panel find-panel" aria-label={t('r.findings')}>
        {/* Game coaching lives only in this slot, so a later "Realistic" view can hide it as a unit. */}
        <div className="coach-slot" data-coaching>
          {mode === 'case' && caseDef && shown && key && (
            <section className="coach" aria-live="polite">
              <span className="tag tag-match">{t('pf.hereItIs')}</span>
              <h2 className="t-title">{KNOWN[caseDef.id].name}</h2>
              <p className="t-body">{KNOWN[caseDef.id].fact}</p>
              <p className="t-body c-2">{watchLine(key, eps)}</p>
              {patch.bands[shown.fromBand].id !== key.bestBand && (
                <p className="t-caption c-3">
                  {t('pf.switched', { label: bandObj.label })}
                  {KNOWN[caseDef.id].snr[patch.bands[shown.fromBand].id] < 3 && ` ${t('pf.barelyShows', { label: patch.bands[shown.fromBand].label })}`}
                </p>
              )}
              {ringsOn && (
                <ul className="show-legend">
                  <li><span className="legend-ring" />{t('pf.whereNow')}</li>
                  {key.motionPx >= 0.4 && <li><span className="legend-ring dashed" />{t('pf.whereWas')}</li>}
                </ul>
              )}
              <button type="button" className="btn btn-primary btn-wide" onClick={hideAnswer}>{t('pf.hide')}</button>
              <div className="coach-links">
                <button type="button" className="btn-link" onClick={() => setRingsOn((v) => !v)}>{ringsOn ? t('pf.ringsOff') : t('pf.ringsOn')}</button>
                <button type="button" className="btn-link" onClick={() => onReveal?.(null, [], true, true)}>{t('pf.fullAnswer')}</button>
              </div>
            </section>
          )}

          {mode === 'case' && caseDef && !shown && (
            <section className="coach">
              <div className="row between">
                <span className="case-chip" style={{ '--c': caseDef.color } as React.CSSProperties}>{t('case.n', { n: caseDef.n })}</span>
                <span className="t-caption c-3">{caseDef.nick}</span>
              </div>
              <p className="goal">{caseDef.goal}</p>
              <ol className="todo">
                <li className={stepDone ? 'done' : ''}>
                  <TodoDot n={1} done={stepDone} />
                  <span>{caseDef.step}</span>
                </li>
                <li className={mark ? 'done' : ''}>
                  <TodoDot n={2} done={!!mark} />
                  <span>{mark ? t('pf.marked') : t('pf.clickDot')}</span>
                </li>
                <li className={chips.length ? 'done' : ''}>
                  <TodoDot n={3} done={chips.length > 0} />
                  <div className="todo-body">
                    <span>{t('pf.whatDid')}</span>
                    <div className="chips" role="group" aria-label={t('pf.whatDid')}>
                      {CHIPS.map((c) => (
                        <button key={c.id} type="button" className="chip" aria-pressed={chips.includes(c.id)} onClick={() => toggleChip(c.id)}>
                          {chips.includes(c.id) && <Icon name="check" size={12} />}
                          {t(`chip.${c.id}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
              </ol>
              {hint && <p className="note" role="status">{t('pf.hintText')}</p>}
              {peeked && <p className="note" role="status">{t('pf.peeked')}</p>}
              <button type="button" className="btn btn-primary btn-wide" disabled={!canReveal} onClick={() => onReveal?.(mark, chips, false, peeked)}>
                {t('pf.check')}
              </button>
              <div className="coach-links">
                <button type="button" className="btn-link" disabled={hint} onClick={() => setHint(true)}>{hint ? t('pf.hintShown') : t('pf.hintGive')}</button>
                <button type="button" className="btn-link" onClick={showAnswer}>{t('pf.showMe')}</button>
              </div>
            </section>
          )}

          {mode === 'explore' && explore && (
            <section className="coach">
              <h2 className="t-title">{t('pf.exploring')}</h2>
              <p className="mono c-2">{formatCoords(explore.ra, explore.dec)}</p>
              <p className="t-body c-2">{mark ? t('pf.exploreMarked') : t('pf.exploreClick')}</p>
              <div className="chips" role="group" aria-label={t('pf.whatDid')}>
                {CHIPS.map((c) => (
                  <button key={c.id} type="button" className="chip" aria-pressed={chips.includes(c.id)} onClick={() => toggleChip(c.id)}>{t(`chip.${c.id}`)}</button>
                ))}
              </div>
              <button type="button" className="btn btn-primary btn-wide" disabled={!mark} onClick={saveObservation}>{t('pf.saveObs')}</button>
              <p className="t-caption c-3" role="status">
                {saved != null ? t('pf.obsSaved', { n: saved }) : t('pf.obsNote')}
              </p>
            </section>
          )}
        </div>

        <section className="block" aria-label={t('r.sourceTitle')}>
          <h2 className="t-label">{t('r.sourceTitle')}</h2>
          <MeasureCard
            patch={patch}
            measurement={measurement}
            verdict={mode === 'explore' ? verdict ?? null : undefined}
            catalogue={mode === 'explore' ? catalogue : undefined}
            onSave={mode === 'explore' ? saveCandidate : undefined}
            saved={candSaved}
          />
          {mode === 'case' && measurement && (
            <p className="t-caption c-3">{t('pf.catLocked')}</p>
          )}
        </section>

        <section className="block" aria-label={t('pf.fieldData')}>
          <h2 className="t-label">{t('pf.fieldData')}</h2>
          <dl className="facts">
            <dt>{t('pf.data')}</dt><dd>{patch.source === 'irsa' ? t('pf.dataReal') : t('pf.dataDemo')}</dd>
            <dt>{t('r.data.centre')}</dt><dd>{formatCoords(patch.center.ra, patch.center.dec)}</dd>
            <dt>{t('r.data.fov')}</dt><dd>{num(patch.fovDeg * 60, patch.fovDeg * 60 < 10 ? 1 : 0)}′ × {num(patch.fovDeg * 60, patch.fovDeg * 60 < 10 ? 1 : 0)}′</dd>
            <dt>{t('r.data.pixel')}</dt><dd>{t('pf.pixelScale', { scale: num(patch.pixelScale, 2), size: patch.size })}</dd>
            <dt>{t('pf.expAll')}</dt><dd>{totalExposures}</dd>
            <dt><Rich text={t('pf.noiseHere')} /></dt><dd>{t('pf.noiseField', { v: num(patch.noise[epoch][band], 2) })}</dd>
            <dt>{t('pf.flaggedField')}</dt><dd>{fieldFlag === null ? t('common.na') : pct1(fieldFlag)}</dd>
            {mark && <><dt>{t('pf.flaggedMark')}</dt><dd>{markFlag === null ? t('common.na') : pct1(markFlag)}</dd></>}
          </dl>
          {markFlag !== null && markFlag >= 0.5 && (
            <p className="note warn">
              {t('pf.satWarn', { label: patch.bands[patch.bands.length - 1].label })}
            </p>
          )}
        </section>

        <section className="block" aria-label={t('pf.spectrum')}>
          <h2 className="t-label">{t('pf.spectrum')}</h2>
          <p className="empty">
            {t('pf.spectrumEmpty')}
          </p>
        </section>

        {mode === 'explore' && changes && (
          <section className="block" aria-label={t('r.changesTitle')}>
            <h2 className="t-label">{t('r.changesTitle')}</h2>
            <ChangesList patch={patch} result={changes} onPick={pickChange} />
          </section>
        )}
      </aside>
    </main>
  );
}
