import { useEffect, useMemo, useRef, useState } from 'react';
import type { CompareMode, Pt, SkyPatch } from '../data/types';
import { GROUPINGS, type GroupId } from '../data/catalog';
import { SkyCanvas, type Ring } from '../components/SkyCanvas';
import { Icon } from '../components/Icon';
import { VisitGrid } from '../components/realistic/VisitGrid';
import { ColorBar } from '../components/realistic/ColorBar';
import {
  CandidatesSection, CatalogueSection, ChangesSection, DataSection, PhotometrySection, SourceSection, SpectrumSection,
} from '../components/realistic/Findings';
import { useCatalogue } from '../data/useCatalogue';
import { useSpectrum } from '../data/spectrumApi';
import { measureBest } from '../sky/measure';
import { checkCatalogue, sourcePixels, type CatalogueSource } from '../sky/catalogue';
import { findChanges, type FieldChange } from '../sky/changes';
import { fieldShares, fluxSeries, photometryTable, positionsByVisit } from '../sky/photometry';
import { percentileStretch, refNoise, type StretchFn } from '../sky/render';
import { pixelToSky, skyToPixel, mjdToYear } from '../sky/astro';
import { sourceAt } from '../sky/catalogue';
import type { Candidate } from '../state/progress';
import type { QualityLayer, RealisticState } from '../state/viewState';
import { R, pctText } from '../ui/realisticText';
import { formatMJySr, percentText } from '../lib/format';
import { num } from '../i18n';
import { useI18n } from '../i18n/react';

const MEASURE_COLOR = '#22d3ee';
const GAIA_COLOR = '#7fdbff';
const KNOWN_COLOR = '#ffb347';
const MAX_MARKS = 20;

const MODE_IDS: CompareMode[] = ['blink', 'diff', 'stack'];
const STRETCH_IDS: StretchFn[] = ['linear', 'asinh', 'sqrt', 'log'];
const LAYER_IDS: QualityLayer[] = ['none', 'flagshare', 'heavy'];
const SPEEDS = [0.5, 1, 2];

type Sheet = 'find' | 'layers' | 'map';

interface Props {
  patch: SkyPatch;
  initial: RealisticState;
  /** Called whenever something that belongs in the shareable link changes. */
  onState: (s: RealisticState) => void;
  onGroup: (g: GroupId) => void;
  candidates: Candidate[];
  onSaveCandidate: (c: Omit<Candidate, 'id' | 'savedAt'>) => void;
  onRemoveCandidate: (id: string) => void;
}

/** First visit with a photo in this band (a safe reference for Difference mode). */
const firstWithPhoto = (patch: SkyPatch, band: number) => {
  const i = patch.epochs.findIndex((_, e) => !patch.missing?.[e]?.[band]);
  return i < 0 ? 0 : i;
};

export function RealisticTool({ patch, initial, onState, onGroup, candidates, onSaveCandidate, onRemoveCandidate }: Props) {
  const { t, lang } = useI18n();
  const measuredLabel = t('rings.measured');
  const nEp = patch.epochs.length;
  const nBands = patch.bands.length;
  const startBand = (() => {
    const i = initial.band ? patch.bands.findIndex((b) => b.id === initial.band) : -1;
    return i >= 0 ? i : nBands - 1;
  })();
  const clampEp = (e: number | undefined, fallback: number) => (e !== undefined && e >= 0 && e < nEp ? e : fallback);

  const [epoch, setEpoch] = useState(() => clampEp(initial.visit, 0));
  const [band, setBand] = useState(startBand);
  const [playing, setPlaying] = useState(false);
  const [axis, setAxis] = useState<'epochs' | 'bands'>('epochs');
  const [speed, setSpeed] = useState(1);
  const [compare, setCompare] = useState<CompareMode>(initial.mode);
  const [refEpoch, setRefEpoch] = useState(() => clampEp(initial.ref, firstWithPhoto(patch, startBand)));
  const [stackSet, setStackSet] = useState<number[]>(() => patch.epochs.map((_, e) => e));
  const [stretchFn, setStretchFn] = useState<StretchFn>(initial.stretch);
  const [lo, setLo] = useState(initial.lo);
  const [hi, setHi] = useState(initial.hi);
  const [quality, setQuality] = useState<QualityLayer>(initial.quality);
  const [grid, setGrid] = useState(false);
  const [magnify, setMagnify] = useState(false);
  const [invert, setInvert] = useState(false);
  const [showCat, setShowCat] = useState(true);
  const [mark, setMark] = useState<Pt | null>(null);
  const [focusPt, setFocusPt] = useState<Pt | null>(null);
  const [sheet, setSheet] = useState<Sheet>('find');
  const [candSaved, setCandSaved] = useState(false);
  const skyRef = useRef<HTMLDivElement>(null);

  // Everything in the shareable link.
  useEffect(() => {
    onState({
      band: patch.bands[band].id, visit: epoch, ref: compare === 'diff' ? refEpoch : undefined, mode: compare,
      stretch: stretchFn, lo, hi, group: initial.group, quality,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band, epoch, refEpoch, compare, stretchFn, lo, hi, quality]);

  const hasShare = !!patch.flagShare;
  const physical = !!patch.noiseRefMJySr;
  const bandObj = patch.bands[band];
  const ep = patch.epochs[epoch];
  const missingHere = !!patch.missing?.[epoch]?.[band];
  const countHere = patch.imageCounts?.[epoch]?.[band];

  // ---------- playback and keys ----------
  useEffect(() => {
    if (!playing || compare === 'stack') return;
    const id = window.setInterval(() => {
      if (axis === 'epochs') setEpoch((e) => (e + 1) % nEp);
      else setBand((b) => (b + 1) % nBands);
    }, 1000 / speed);
    return () => window.clearInterval(id);
  }, [playing, compare, axis, speed, nEp, nBands]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
      const step = (d: number) => {
        setPlaying(false);
        if (axis === 'epochs') setEpoch((v) => (v + d + nEp) % nEp);
        else setBand((v) => (v + d + nBands) % nBands);
      };
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [axis, nEp, nBands]);

  // ---------- picture ----------
  const bandFrames = useMemo(() => patch.frames.map((f) => f[band]), [patch, band]);
  const bandMasks = useMemo(() => patch.nodata?.map((n) => n[band]) ?? [], [patch, band]);
  const noiseRef = useMemo(() => refNoise(patch.noise, band), [patch, band]);
  const stretch = useMemo(
    () => percentileStretch(bandFrames, bandMasks, lo, hi, stretchFn, noiseRef),
    [bandFrames, bandMasks, lo, hi, stretchFn, noiseRef],
  );
  const unit = patch.noiseRefMJySr ?? 1;
  const diffScale = 6 * Math.max(patch.noise[epoch][band], patch.noise[refEpoch][band]);
  const stackUsed = stackSet.filter((e) => !patch.missing?.[e]?.[band]);

  // ---------- measurements ----------
  const measurement = useMemo(() => (mark ? measureBest(patch, mark) : null), [mark, patch]);
  const positions = useMemo(() => (mark ? positionsByVisit(patch, mark, measurement) : null), [mark, patch, measurement]);
  const table = useMemo(() => (positions && physical ? photometryTable(patch, positions) : null), [positions, patch, physical]);
  const series = useMemo(() => (table ? fluxSeries(patch, table) : []), [table, patch]);
  const catalogue = useCatalogue(patch, true);
  const verdict = useMemo(
    () => (measurement && measurement.status === 'ok' ? checkCatalogue(patch, measurement, catalogue.sources) : null),
    [measurement, patch, catalogue.sources],
  );
  const changes = useMemo(() => findChanges(patch, band), [patch, band]);
  const spectrumAt = useMemo(() => (positions ? pixelToSky(patch, positions[epoch].x, positions[epoch].y) : null), [positions, patch, epoch]);
  const spectrum = useSpectrum(spectrumAt ? { ra: spectrumAt.ra, dec: spectrumAt.dec } : null, patch.source === 'irsa');
  const shares = useMemo(() => fieldShares(patch, epoch, band), [patch, epoch, band]);

  // ---------- catalogue marks ----------
  const catalogueMarks = useMemo(() => {
    const rings: Ring[] = [];
    const paths: Pt[][] = [];
    const inView: CatalogueSource[] = [];
    const list = [...catalogue.sources].sort((a, b) => Number(b.origin === 'known') - Number(a.origin === 'known') || (a.gmag ?? 99) - (b.gmag ?? 99));
    for (const s of list) {
      const pts = sourcePixels(patch, s);
      if (!pts.some((p) => p.x >= 0 && p.y >= 0 && p.x < patch.size && p.y < patch.size)) continue;
      inView.push(s);
      if (rings.length >= MAX_MARKS) continue;
      const p = pts[epoch];
      rings.push({
        x: p.x, y: p.y, color: s.origin === 'known' ? KNOWN_COLOR : GAIA_COLOR, r: 2.6 * (6.15 / patch.pixelScale) / 2 + 1,
        label: s.origin === 'known' ? s.name : s.gmag != null ? `G ${num(s.gmag, 1, lang)}` : undefined,
      });
      if (Math.hypot(pts[nEp - 1].x - pts[0].x, pts[nEp - 1].y - pts[0].y) * patch.pixelScale > 4) paths.push(pts);
    }
    return { rings, paths, inView };
  }, [patch, epoch, catalogue.sources, nEp, lang]);

  const measureRings = useMemo<Ring[]>(() => {
    if (!measurement || measurement.status !== 'ok') return [];
    const p = measurement.points.find((q) => q.epoch === epoch);
    return p ? [{ x: p.x, y: p.y, color: MEASURE_COLOR, r: 2.2 * (6.15 / patch.pixelScale) / 2 + 0.8, label: measuredLabel }] : [];
  }, [measurement, epoch, patch.pixelScale, measuredLabel]);
  const rings = [...measureRings, ...(showCat ? catalogueMarks.rings : [])];

  function pickChange(c: FieldChange) {
    setFocusPt({ x: c.x, y: c.y });
    setMark({ x: c.x, y: c.y });
    setMagnify(true);
    setCandSaved(false);
  }

  function pickSource(s: CatalogueSource) {
    const q = sourceAt(s, mjdToYear(ep.mjd));
    const p = skyToPixel(patch, q.ra, q.dec);
    setFocusPt({ x: p.x, y: p.y });
    setMagnify(true);
    setSheet('find');
  }

  function saveCandidate() {
    if (!measurement || measurement.status !== 'ok') return;
    const last = measurement.points[measurement.points.length - 1];
    onSaveCandidate({
      ra: last.ra, dec: last.dec, shiftArcsec: measurement.shiftArcsec, rateArcsecPerYear: measurement.rate,
      verdict: verdict?.source ? `${verdict.kind}: ${verdict.source.name}` : 'none',
      verdictKind: verdict?.kind ?? 'none', verdictSource: verdict?.source ? { name: verdict.source.name, origin: verdict.source.origin, gmag: verdict.source.gmag } : null,
      verdictMoves: verdict?.moves ?? null, verdictRate: verdict?.catRate ?? null,
      band: patch.bands[measurement.band].id, note: '',
    });
    setCandSaved(true);
  }

  // Timeline, visits placed by mid-date.
  const mjds = patch.epochs.map((e) => e.mjd);
  const tLo = Math.min(...mjds), tHi = Math.max(...mjds);
  const place = (m: number) => (tHi > tLo ? 6 + ((m - tLo) / (tHi - tLo)) * 88 : 50);

  const cycling = playing && compare !== 'stack';
  const group = GROUPINGS.find((g) => g.id === initial.group) ?? GROUPINGS[1];
  const changeBand = (b: number) => {
    setBand(b);
    setRefEpoch((r) => (patch.missing?.[r]?.[b] ? firstWithPhoto(patch, b) : r));
  };

  const sheetTabs: { id: Sheet; name: string }[] = [
    { id: 'find', name: R.tabs.find }, { id: 'layers', name: R.tabs.layers }, { id: 'map', name: R.tabs.map },
  ];

  return (
    <main className="tool" data-view="realistic" data-sheet={sheet}>
      {/* ---------- left: bands x visits ---------- */}
      <aside className="panel nav-panel" aria-label={t('r.bandsAndVisits')}>
        <div className="block-flat">
          <h2 className="t-label">{R.groupingTitle}</h2>
          <div className="seg" role="group" aria-label={R.groupingTitle}>
            {GROUPINGS.map((g) => (
              <button key={g.id} type="button" aria-pressed={g.id === initial.group} onClick={() => g.id !== initial.group && onGroup(g.id)}>{R.groupingNames[g.id]}</button>
            ))}
          </div>
          <p className="t-caption c-3">{R.groupingHelp(group.gapDays, group.maxSpanDays)}</p>
        </div>
        <hr className="div" />
        <VisitGrid
          patch={patch}
          epoch={epoch}
          band={band}
          onPick={(e, b) => { setEpoch(e); changeBand(b); setPlaying(false); }}
          onBand={changeBand}
          stack={stackSet}
          showStack={compare === 'stack'}
          onToggleStack={(e) => setStackSet((s) => (s.includes(e) ? s.filter((x) => x !== e) : [...s, e].sort((a, b) => a - b)))}
        />
        <hr className="div" />
        <div className="row between">
          <span className="t-label">{R.stepThrough}</span>
          <div className="seg" role="group" aria-label={R.stepThrough}>
            <button type="button" aria-pressed={axis === 'epochs'} onClick={() => setAxis('epochs')}>{R.stepEpochs}</button>
            <button type="button" aria-pressed={axis === 'bands'} onClick={() => setAxis('bands')}>{R.stepBands}</button>
          </div>
        </div>
        <p className="t-caption c-3">{R.stepHelp(axis)}</p>
        <hr className="div" />
        <h2 className="t-label">{R.shownNow}</h2>
        <dl className="facts">
          <dt>{R.shown.visit}</dt><dd>{R.visitOf(epoch, nEp, ep.label)}</dd>
          <dt>{R.shown.window}</dt><dd>{ep.dates}</dd>
          <dt>{R.shown.band}</dt><dd>{bandObj.id}, {num(bandObj.rangeUm[0], 2)}–{num(bandObj.rangeUm[1], 2)} µm</dd>
          <dt>{R.shown.exposures}</dt><dd>{missingHere ? R.noExposures : countHere ?? ep.imageCount}</dd>
          <dt>{R.shown.noise}</dt><dd>{missingHere ? t('common.na') : physical ? `${formatMJySr(patch.noise[epoch][band] * unit, true)} MJy/sr` : t('r.noiseRef', { v: num(patch.noise[epoch][band], 2) })}</dd>
          <dt>{R.shown.flagged}</dt><dd>{shares ? percentText(pctText(shares.flagged * 100)) : t('common.na')}</dd>
        </dl>
      </aside>

      {/* ---------- centre ---------- */}
      <div className="center">
        <div className="stage-slot" ref={skyRef}>
          <SkyCanvas
            chrome
            className="sky-main"
            patch={patch}
            epoch={epoch}
            band={band}
            mode={compare}
            invert={invert}
            magnify={magnify}
            grid={grid}
            stretchOverride={stretch}
            quality={hasShare ? quality : 'none'}
            physical={physical}
            refEpoch={refEpoch}
            stackEpochs={stackUsed}
            mark={mark}
            rings={rings}
            path={showCat && catalogueMarks.paths.length ? catalogueMarks.paths[0] : undefined}
            focus={focusPt}
            onTap={(p) => { setMark(p); setCandSaved(false); setFocusPt(null); }}
            tapLabel={R.imageLabel}
          >
            <div className="sky-lab">
              <b>{compare === 'stack' ? R.stackLabel : ep.label}</b>
              <span>
                {compare === 'stack'
                  ? R.stackExposures(stackUsed.reduce((s, e) => s + (patch.imageCounts?.[e]?.[band] ?? 0), 0))
                  : missingHere ? R.noPhotoChip : R.exposuresN(countHere ?? ep.imageCount)}
                {compare === 'diff' ? ` · ${R.diffMinus(patch.epochs[refEpoch].label)}` : ''}
              </span>
              <span>{compare === 'stack' ? t('r.visitsOf', { used: stackUsed.length, n: nEp }) : ep.dates}</span>
            </div>
            <span className="sky-band" style={{ borderColor: bandObj.color }}><i style={{ background: bandObj.color }} />{bandObj.id} · {num(bandObj.rangeUm[0], 2)}–{num(bandObj.rangeUm[1], 2)} µm</span>
            {patch.source === 'mock' && <span className="sky-chip sky-chip-bottom">{R.demoChip}</span>}
            {missingHere && compare === 'blink' && <span className="sky-chip sky-chip-nodata">{R.noPhotoChip}</span>}
          </SkyCanvas>
        </div>

        <ColorBar
          stretch={stretch}
          tint={bandObj.tint}
          invert={invert}
          noiseRefMJySr={patch.noiseRefMJySr}
          quality={hasShare ? quality : 'none'}
          diff={compare === 'diff'}
          diffScale={diffScale}
          hasNoData={!!patch.nodata}
        />

        <div className="bar timeline">
          <button type="button" className="playbtn" onClick={() => setPlaying((p) => !p)} disabled={compare === 'stack'} aria-label={cycling ? R.pause : R.play}>
            <Icon name={cycling ? 'pause' : 'play'} size={16} />
          </button>
          <div className="track" role="group" aria-label={t('r.visitsByDate')}>
            {patch.epochs.map((e, i) => {
              const left = place(e.mjd);
              const crowded = patch.epochs.some((o, j) => j !== i && Math.abs(place(o.mjd) - left) < 14);
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
            {MODE_IDS.map((m) => (
              <button key={m} type="button" aria-pressed={compare === m} title={R.modes[m].sub} onClick={() => setCompare(m)}>{R.modes[m].name}</button>
            ))}
          </div>
          {compare === 'diff' && (
            <label className="inline-select">
              <span className="t-caption c-3">{R.reference}</span>
              <select className="select select-sm" value={refEpoch} onChange={(e) => setRefEpoch(Number(e.target.value))} aria-label={R.refTitle}>
                {patch.epochs.map((e, i) => <option key={e.index} value={i} disabled={!!patch.missing?.[i]?.[band]}>{i + 1}: {e.label}</option>)}
              </select>
            </label>
          )}
          <select className="select select-sm" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label={R.speedLabel}>
            {SPEEDS.map((s) => <option key={s} value={s}>{t('r.fps', { v: num(s, Number.isInteger(s) ? 0 : 1) })}</option>)}
          </select>
        </div>
        <p className="mode-note t-caption c-3"><b>{R.modes[compare].name}.</b> {R.modes[compare].sub}</p>

        <div className="sheet-tabs seg" role="tablist" aria-label={t('r.panels')}>
          {sheetTabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={sheet === t.id} aria-pressed={sheet === t.id} onClick={() => setSheet(t.id)}>{t.name}</button>
          ))}
        </div>

        <div className="bar viewrow real-controls" aria-label={t('r.displayLayers')}>
          <div className="ctl-group">
            <span className="t-micro c-3">{R.stretchTitle}</span>
            <div className="seg" role="group" aria-label={R.stretchTitle}>
              {STRETCH_IDS.map((s) => (
                <button key={s} type="button" aria-pressed={stretchFn === s} onClick={() => setStretchFn(s)}>{R.stretchNames[s]}</button>
              ))}
            </div>
          </div>
          <div className="ctl-group cuts">
            <label>
              <span>{R.lowCut} {percentText(num(lo, Number.isInteger(lo) ? 0 : 1))}</span>
              <input type="range" min="0" max="60" step="0.5" value={lo} onChange={(e) => setLo(Math.min(Number(e.target.value), hi - 1))} />
              <output>{physical ? `${formatMJySr(stretch.lo * unit)} MJy/sr` : `${num(stretch.lo, 1)} σ`}</output>
            </label>
            <label>
              <span>{R.highCut} {percentText(num(hi, Number.isInteger(hi) ? 0 : 1))}</span>
              <input type="range" min="60" max="100" step="0.1" value={hi} onChange={(e) => setHi(Math.max(Number(e.target.value), lo + 1))} />
              <output>{physical ? `${formatMJySr(stretch.hi * unit)} MJy/sr` : `${num(stretch.hi, 1)} σ`}</output>
            </label>
            <p className="t-caption c-3" hidden>{R.cutHelp}</p>
          </div>
          <div className="ctl-group">
            <span className="t-micro c-3">{R.layerTitle}</span>
            <div className="seg" role="group" aria-label={R.layerTitle}>
              {LAYER_IDS.map((l) => (
                <button key={l} type="button" aria-pressed={quality === l && (hasShare || l === 'none')} disabled={l !== 'none' && !hasShare} title={hasShare ? R.layerHelp[l] : R.layerUnavailable} onClick={() => setQuality(l)}>{R.layers[l]}</button>
              ))}
            </div>
            {hasShare && R.layerHelp[quality] && <p className="t-caption c-3">{R.layerHelp[quality]}</p>}
            {!hasShare && <p className="t-caption c-3">{R.layerUnavailable}</p>}
          </div>
          <div className="layers ctl-group" role="group" aria-label={t('r.layersGroup')}>
            <button type="button" className="layer" aria-pressed={showCat} onClick={() => setShowCat((v) => !v)}><i className="mk gaia" />{R.catalogueMarks}</button>
            <button type="button" className="layer" aria-pressed={grid} onClick={() => setGrid((g) => !g)}>{R.grid}</button>
            <button type="button" className="layer" aria-pressed={magnify} onClick={() => setMagnify((m) => !m)}>{R.magnifier}</button>
            <button type="button" className="layer" aria-pressed={invert} onClick={() => setInvert((v) => !v)}>{R.invert}</button>
          </div>
        </div>
      </div>

      {/* ---------- right: findings ---------- */}
      <aside className="panel find-panel" aria-label={t('r.findings')}>
        <section className="block" aria-label={R.sourceTitle}>
          <h2 className="t-label">{R.sourceTitle}</h2>
          <SourceSection patch={patch} epoch={epoch} measurement={measurement} positions={positions} table={table} mark={mark} onClear={() => { setMark(null); setCandSaved(false); }} />
        </section>
        <section className="block" aria-label={R.photTitle}>
          <h2 className="t-label">{R.photTitle}</h2>
          <PhotometrySection patch={patch} table={table} series={series} epoch={epoch} />
        </section>
        <section className="block" aria-label={R.spectrumTitle}>
          <h2 className="t-label">{R.spectrumTitle}</h2>
          <SpectrumSection spectrum={spectrum} hasMark={!!mark && patch.source === 'irsa'} />
        </section>
        <section className="block" aria-label={R.catTitle}>
          <h2 className="t-label">{R.catTitle}</h2>
          <CatalogueSection patch={patch} epoch={epoch} catalogue={catalogue} rows={catalogueMarks.inView} verdict={verdict} measurement={measurement} onPick={pickSource} />
          {catalogueMarks.inView.length > MAX_MARKS && <p className="t-caption c-3">{R.showingBrightest(MAX_MARKS, catalogueMarks.inView.length)}</p>}
        </section>
        <section className="block" aria-label={R.changesTitle}>
          <h2 className="t-label">{R.changesTitle}</h2>
          <ChangesSection patch={patch} result={changes} onPick={pickChange} />
        </section>
        <section className="block" aria-label={R.candTitle}>
          <h2 className="t-label">{R.candTitle}</h2>
          <CandidatesSection
            candidates={candidates}
            canSave={!!measurement && measurement.status === 'ok'}
            saved={candSaved}
            onSave={saveCandidate}
            onRemove={onRemoveCandidate}
          />
        </section>
        <section className="block" aria-label={R.dataTitle}>
          <h2 className="t-label">{R.dataTitle}</h2>
          {patch.source === 'mock' && <p className="note warn">{R.demoNotice}</p>}
          <DataSection patch={patch} epoch={epoch} band={band} fieldFlag={shares?.flagged ?? null} fieldNoData={shares?.nodata ?? null} group={initial.group} />
        </section>
      </aside>
    </main>
  );
}
