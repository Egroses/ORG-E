import { Fragment } from 'react';
import type { Pt, SkyPatch } from '../../data/types';
import { GROUPINGS, type GroupId } from '../../data/catalog';
import type { CatalogueState } from '../../data/useCatalogue';
import { APERTURES, type Aperture, type SpectrumState, type SpectrumView } from '../../data/spectrumApi';
import { findBlends, summarize, type Blend } from '../../sky/spectrum';
import type { Candidate } from '../../state/progress';
import { candidatesToCsv } from '../../state/progress';
import type { Verdict, CatalogueSource } from '../../sky/catalogue';
import { motionArcsecPerYear, pmUnreliable, sourceAt } from '../../sky/catalogue';
import type { ChangesResult, FieldChange } from '../../sky/changes';
import type { Measurement } from '../../sky/measure';
import {
  APERTURE_ARCSEC, bandRatio, positionAngle, type FluxSeries, type PhotometryCell,
} from '../../sky/photometry';
import { formatDec, formatDecFine, formatRa, formatRaFine, mjdToYear, pixelToSky } from '../../sky/astro';
import { mjdToDateText } from '../../lib/format';
import { num, sig as sigFmt, t } from '../../i18n';
import { useI18n } from '../../i18n/react';
import { ChannelSpectrumChart, FluxChart, SpectrumChart } from '../Charts';
import { Icon } from '../Icon';
import { R, fluxText, flagPct } from '../../ui/realisticText';
import { changeAmountText, changeWhereText } from '../../sky/changes';

// ---------------------------------------------------------------- marked source

interface SourceProps {
  patch: SkyPatch;
  epoch: number;
  measurement: Measurement | null;
  positions: Pt[] | null;
  table: PhotometryCell[][] | null;
  mark: Pt | null;
  onClear: () => void;
}

export function SourceSection({ patch, epoch, measurement: m, positions, table, mark, onClear }: SourceProps) {
  useI18n();
  if (!mark || !m || !positions) return <p className="empty">{R.sourceEmpty}</p>;
  const sky = pixelToSky(patch, positions[epoch].x, positions[epoch].y);
  const band = patch.bands[m.band];
  if (m.status === 'nodata') return <><p className="empty">{R.sourceNoData}</p><button type="button" className="btn-link" onClick={onClear}>{R.clearMark}</button></>;
  if (m.status === 'faint') return <><p className="empty">{R.sourceNotFound}</p><button type="button" className="btn-link" onClick={onClear}>{R.clearMark}</button></>;
  const pm = m.rate;
  const pmErr = m.years > 0.05 ? m.errArcsec / m.years : null;
  const eastRate = m.years > 0.05 ? (m.east / m.years) * 1000 : null;
  const northRate = m.years > 0.05 ? (m.north / m.years) * 1000 : null;
  const several = m.points.length > 1;
  const significant = several && m.shiftArcsec > 3 * m.errArcsec;
  return (
    <div className="measure">
      <dl className="facts">
        <dt>{R.rows.position}</dt><dd>{formatRaFine(sky.ra)} {formatDecFine(sky.dec)}</dd>
        <dt>{R.rows.positionDeg}</dt><dd>{num(sky.ra, 5)}, {sky.dec >= 0 ? '+' : '−'}{num(Math.abs(sky.dec), 5)}</dd>
        {several ? (
          <>
            <dt>{R.rows.shift}</dt><dd>{R.shiftValue(m.shiftArcsec, m.errArcsec)}</dd>
            <dt>{R.rows.span}</dt><dd>{R.spanValue(m.years)}</dd>
            {pm !== null && pmErr !== null && <><dt>{R.rows.pm}</dt><dd>{R.pmValue(pm, pmErr)}</dd></>}
            {eastRate !== null && northRate !== null && <><dt>{R.rows.pmComp}</dt><dd>{R.pmCompValue(eastRate, northRate)}</dd></>}
            <dt>{R.rows.pa}</dt><dd>{R.paValue(positionAngle(m.east, m.north))}</dd>
          </>
        ) : null}
      </dl>
      {!several && <p className="t-caption c-3">{R.sourceOneVisit}</p>}
      {several && !significant && <p className="t-caption c-3">{R.notSignificant}</p>}
      {m.jumpy && <p className="note warn">{R.jumpy}</p>}
      {m.saturated && <p className="note warn">{R.saturatedSource}</p>}

      <h3 className="t-micro c-3">{R.perVisitTitle}</h3>
      <div className="tbl-scroll">
        <table className="mini">
          <thead>
            <tr><th>{R.perVisitCols.visit}</th><th>{R.perVisitCols.centroid}</th><th className="num">{R.perVisitCols.err}</th><th className="num">{R.perVisitFluxBand(band.id)}</th></tr>
          </thead>
          <tbody>
            {m.points.map((p) => {
              const c = table?.[m.band]?.[p.epoch];
              return (
                <tr key={p.epoch}>
                  <td>{p.epoch + 1}</td>
                  <td className="mono">{formatRaFine(p.ra)}<br />{formatDecFine(p.dec)}</td>
                  <td className="num">{num(p.errArcsec, 2)}</td>
                  <td className="num">{c && c.status === 'ok' ? `${c.lowerLimit ? '≥ ' : ''}${fluxText(c.fluxMJy)} ± ${fluxText(c.errMJy)}` : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="t-caption c-3">{R.measuredIn(band.id, `${num(band.rangeUm[0], 2)}–${num(band.rangeUm[1], 2)} µm`)}</p>
      <button type="button" className="btn-link" onClick={onClear}>{R.clearMark}</button>
    </div>
  );
}

// ---------------------------------------------------------------- photometry

interface PhotProps {
  patch: SkyPatch;
  table: PhotometryCell[][] | null;
  series: FluxSeries[];
  epoch: number;
}

const RATIO_PAIRS: [string, string][] = [['D6', 'D2'], ['D4', 'D2']];

export function PhotometrySection({ patch, table, series, epoch }: PhotProps) {
  useI18n();
  if (!patch.noiseRefMJySr) return <p className="empty">{R.photNeedsReal}</p>;
  if (!table) return <p className="empty">{R.sourceEmpty}</p>;
  const anyOk = series.some((s) => s.points.length);
  const pairs = RATIO_PAIRS
    .map(([n, d]) => ({ n, d, bn: patch.bands.findIndex((b) => b.id === n), bd: patch.bands.findIndex((b) => b.id === d) }))
    .filter((p) => p.bn >= 0 && p.bd >= 0);
  const ratios = pairs.map((p) => bandRatio(table, p.bn, p.bd));
  const anyLimited = ratios.some((rs) => rs.some((r) => r.limited && r.value !== null));
  return (
    <div className="phot">
      <p className="t-caption c-3">{R.photSubtitle(APERTURE_ARCSEC)}</p>
      <div className="tbl-scroll">
        <table className="mini phot-table">
          <thead>
            <tr>
              <th>{R.photColVisit}</th>
              {patch.bands.map((b) => <th key={b.id} className="num"><i className="swatch" style={{ background: b.color }} />{b.id}</th>)}
            </tr>
          </thead>
          <tbody>
            {patch.epochs.map((ep, e) => (
              <tr key={ep.index} className={e === epoch ? 'on' : ''} title={`${ep.label}: ${ep.dates}`}>
                <td>{e + 1}</td>
                {patch.bands.map((b, bi) => {
                  const c = table[bi][e];
                  if (c.status !== 'ok') return <td key={b.id} className="num c-3" title={R.mapNoPhoto}>{R.photNoPhoto}</td>;
                  return (
                    <td key={b.id} className={`num${c.lowerLimit ? ' limit' : ''}`}>
                      {c.lowerLimit ? '≥ ' : ''}{fluxText(c.fluxMJy)}
                      <small>± {fluxText(c.errMJy)}</small>
                      <small className="flag">{flagPct(c.flaggedShare + c.nodataShare)}</small>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="t-caption c-3">{R.photUnits}</p>
      <p className="t-caption c-3">{R.photLowerLimit}</p>
      <p className="t-caption c-3">{R.photErrNote}</p>

      <h3 className="t-micro c-3">{R.chartTitle}</h3>
      {anyOk ? (
        <>
          <FluxChart series={series} label={R.chartLabel} />
          <p className="t-caption c-3">{R.chartLegendLimit}. {R.chartNote}</p>
        </>
      ) : <p className="empty">{R.chartEmpty}</p>}

      {pairs.length > 0 && (
        <>
          <h3 className="t-micro c-3">{R.ratioTitle}</h3>
          <div className="tbl-scroll">
            <table className="mini">
              <thead>
                <tr><th>{R.photColVisit}</th>{pairs.map((p) => <th key={p.n} className="num">{R.ratioBand(p.n, p.d)}</th>)}</tr>
              </thead>
              <tbody>
                {patch.epochs.map((ep, e) => (
                  <tr key={ep.index} className={e === epoch ? 'on' : ''}>
                    <td>{e + 1}</td>
                    {ratios.map((rs, k) => {
                      const r = rs[e];
                      return <td key={pairs[k].n} className="num">{r.value === null ? R.ratioNone : `${fluxText(r.value)} ± ${fluxText(r.err ?? 0)}${r.limited ? '*' : ''}`}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="t-caption c-3">{R.ratioNote}{anyLimited ? ` ${R.ratioLimited}` : ''}</p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- spectrum

interface SpecProps {
  spectrum: SpectrumState;
  hasMark: boolean;
  view: SpectrumView;
  aperture: Aperture;
  onView: (v: SpectrumView) => void;
  onAperture: (a: Aperture) => void;
  /** Measured position and the year of the picture it was marked on (blend check). */
  at: { ra: number; dec: number } | null;
  year: number;
  /** Everything loaded from Gaia and CatWISE, to look for neighbours inside the aperture. */
  sources: CatalogueSource[];
  catalogueReady: boolean;
}

/** One note for the nearest Gaia star and one for the nearest WISE source inside the aperture. */
function blendLines(blends: Blend[], aperture: number): string[] {
  const tip = aperture > 1 ? t('sui.blendTip') : '';
  const out: string[] = [];
  const gaia = blends.filter((b) => b.source.origin === 'gaia');
  const wise = blends.filter((b) => b.source.origin === 'wise');
  const more = (n: number) => (n > 1 ? t('sui.blendMore', { n: n - 1 }) : '');
  if (gaia[0]) {
    const s = gaia[0].source, d = num(gaia[0].distArcsec, 1);
    out.push((s.gmag != null ? t('sui.blendGaia', { g: num(s.gmag, 1), d, tip }) : t('sui.blendGaiaNoG', { d, tip })) + more(gaia.length));
  }
  if (wise[0]) {
    const s = wise[0].source, d = num(wise[0].distArcsec, 1);
    out.push((s.w2 != null ? t('sui.blendWise', { w2: num(s.w2, 1), d, tip: gaia[0] ? '' : tip }) : t('sui.blendWiseNoMag', { d, tip: gaia[0] ? '' : tip })) + more(wise.length));
  }
  return out;
}

export function SpectrumSection({ spectrum, hasMark, view, aperture, onView, onAperture, at, year, sources, catalogueReady }: SpecProps) {
  useI18n();
  if (!hasMark) return <p className="empty">{R.spectrumNeedMark}</p>;
  const controls = (
    <div className="spec-controls">
      <div className="seg" role="group" aria-label={t('sui.viewTitle')}>
        <button type="button" aria-pressed={view === 'binned'} onClick={() => onView('binned')} title={t('sui.viewBinnedHelp')}>{t('sui.viewBinned')}</button>
        <button type="button" aria-pressed={view === 'all'} onClick={() => onView('all')} title={t('sui.viewAllHelp')}>{t('sui.viewAll')}</button>
      </div>
      <div className="row" style={{ gap: 6, alignItems: 'center' }}>
        <span className="t-micro c-3" title={t('sui.apHelp')}>{t('sui.apTitle')}</span>
        <div className="seg" role="group" aria-label={t('sui.apTitle')} title={t('sui.apHelp')}>
          {APERTURES.map((a) => <button key={a} type="button" aria-pressed={aperture === a} onClick={() => onAperture(a)}>{t('sui.apOption', { n: a })}</button>)}
        </div>
      </div>
    </div>
  );
  let body: React.ReactNode = null;
  if (spectrum.status === 'loading') body = <p className="empty" role="status">{t('sui.loading')}</p>;
  else if (spectrum.status === 'nocoverage') body = <p className="empty">{t('sui.noCoverage')}</p>;
  else if (spectrum.status === 'error') body = <p className="empty" role="alert">{t('sui.error')}</p>;
  else if (spectrum.status === 'empty' || spectrum.status === 'ok') {
    const r = spectrum.result;
    const ap = r?.kind === 'binned' ? r.data.aperturePx : aperture;
    const blends = at ? findBlends(at, ap, sources, year) : [];
    const blendNotes = catalogueReady ? blendLines(blends, ap) : [t('sui.blendNoCatalogue')];
    let sat = false, masked = false;
    let summary = '';
    let chart: React.ReactNode = null;
    let warnings: string[] = [];
    if (r?.kind === 'binned') {
      const sm = summarize(r.data.channels);
      sat = sm.saturated > 0;
      masked = !sat && sm.lowerLimits > 0;
      warnings = r.data.warnings;
      summary = t('sui.summary', { used: sm.withValue, total: sm.total, n: sm.exposures, skipped: sm.skipped, ap: num(r.data.aperturePx, 0) });
      chart = spectrum.status === 'ok' ? <ChannelSpectrumChart channels={r.data.channels} label={t('sui.chartBinned')} /> : null;
      if (sm.empty > 0 && spectrum.status === 'ok') summary += ' ' + t('sui.gapsNote', { n: sm.empty });
    } else if (r?.kind === 'all') {
      const limits = r.points.filter((p) => p.lowerLimit).length;
      sat = r.points.some((p) => p.saturated);
      masked = !sat && limits > 0;
      summary = t('sui.summaryAll', { n: r.points.length, limits, bad: r.points.filter((p) => p.flagged).length });
      chart = r.points.length ? <SpectrumChart points={r.points} label={t('sui.chartAll')} /> : null;
    }
    body = (
      <>
        {spectrum.status === 'empty' && <p className="empty">{t('sui.empty')}</p>}
        {chart}
        <p className="t-caption c-3">{summary}</p>
        <div className="spec-notes">
          {sat && <p className="note warn">{t('sui.saturated')}</p>}
          {masked && <p className="note">{t('sui.masked')}</p>}
          {warnings.length > 0 && <p className="note"><b>{t('sui.backendWarnings')}</b> {warnings.join(' ')}</p>}
          {blendNotes.map((n, i) => <p key={i} className={`note${blends.length ? ' warn' : ''}`}>{n}</p>)}
          {!blends.length && catalogueReady && <p className="t-caption c-3">{t('sui.blendNone')}</p>}
        </div>
      </>
    );
  }
  return <>{controls}{body}</>;
}

// ---------------------------------------------------------------- catalogue

interface CatProps {
  patch: SkyPatch;
  epoch: number;
  catalogue: CatalogueState;
  rows: CatalogueSource[];
  verdict: Verdict | null;
  measurement: Measurement | null;
  onPick: (s: CatalogueSource) => void;
  /** WISE marks are on (rows then include CatWISE entries). */
  showWise?: boolean;
}

function PmSnr({ s }: { s: CatalogueSource }) {
  if (s.origin === 'known') return <>{'–'}</>;
  if (s.pmSnr == null) return <span title={t('sui.pmHelp')}>{t('sui.snrUnknown')}</span>;
  const low = pmUnreliable(s);
  return <span className={low ? 'pm-snr-low' : undefined} title={low ? t('sui.snrLow') : t('sui.snrOk')}>{num(s.pmSnr, s.pmSnr >= 10 ? 0 : 1)}{low ? ' !' : ''}</span>;
}

const magText = (s: CatalogueSource) =>
  s.origin === 'wise'
    ? (s.w1 != null || s.w2 != null ? t('sui.magW', { w1: s.w1 != null ? num(s.w1, 1) : '–', w2: s.w2 != null ? num(s.w2, 1) : '–' }) : R.catNoG)
    : s.gmag != null ? t('sui.magG', { v: num(s.gmag, 1) }) : R.catNoG;

export function CatalogueSection({ patch, epoch, catalogue, rows, verdict, measurement, onPick, showWise = false }: CatProps) {
  useI18n();
  const year = mjdToYear(patch.epochs[epoch].mjd);
  return (
    <div>
      <p className="t-caption c-3">{catalogue.status === 'ok' ? R.catSourceGaia : catalogue.status === 'unavailable' ? R.catSourceBuiltIn : R.catSourceBuiltIn}</p>
      {verdict && (
        <div className="cat-match">
          <h3 className="t-micro c-3">{R.catMatchTitle}</h3>
          <p className="t-body">
            {verdict.source && verdict.offsetArcsec !== null && verdict.catRate !== null
              ? (verdict.kind === 'weak'
                ? `${R.catMatch(verdict.source.name, verdict.offsetArcsec, verdict.catRate, null, false)} ${t('sui.catMatchWeak', { snr: num(verdict.source.pmSnr ?? 0, 1) })}`
                : R.catMatch(verdict.source.name, verdict.offsetArcsec, verdict.catRate, measurement?.rate ?? null, verdict.kind === 'match'))
              : R.catMatchNone}
          </p>
        </div>
      )}
      {rows.length === 0 ? <p className="empty">{R.catEmpty}</p> : (
        <div className="tbl-scroll cat-scroll">
          <table className="mini cat-table">
            <thead><tr><th>{R.catCols.name}</th><th className="num">{t('sui.colMag')}</th><th className="num">{R.catCols.pm}</th><th className="num" title={t('sui.pmHelp')}>{t('sui.colSnr')}</th><th>{R.catCols.pos}</th></tr></thead>
            <tbody>
              {rows.map((s) => {
                const p = sourceAt(s, year);
                return (
                  <tr key={s.id}>
                    <td><button type="button" className="btn-link" onClick={() => onPick(s)} title={R.catClick}>{s.name}</button></td>
                    <td className="num">{magText(s)}</td>
                    <td className="num">{num(motionArcsecPerYear(s) * 1000, 0)}</td>
                    <td className="num"><PmSnr s={s} /></td>
                    <td className="mono">{formatRa(p.ra)}<br />{formatDec(p.dec)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {catalogue.wise.status === 'loading' && <p className="t-caption c-3" role="status">{t('sui.wiseLoading')}</p>}
      {catalogue.wise.status === 'archive' && <p className="note" role="status">{t('sui.wiseArchive')}</p>}
      {catalogue.wise.status === 'unreachable' && <p className="note" role="status">{t('sui.wiseDown')}</p>}
      {catalogue.wise.status === 'ok' && showWise && !rows.some((r) => r.origin === 'wise') && <p className="t-caption c-3">{t('sui.wiseEmpty')}</p>}
      <p className="t-caption c-3">{R.catClick} {R.trails}</p>
      <p className="t-caption c-3">{t('sui.pmHelp')}</p>
      <p className="t-caption c-3">{t('sui.wiseHelp')}</p>
    </div>
  );
}

// ---------------------------------------------------------------- changes

export function ChangesSection({ patch, result, onPick }: { patch: SkyPatch; result: ChangesResult; onPick: (c: FieldChange) => void }) {
  const { t } = useI18n();
  if (result.single) return <p className="empty">{R.changesSingle}</p>;
  return (
    <div className="changes-wrap">
      <p className="t-caption c-3">{R.changesBetween(patch.epochs[result.first].label, patch.epochs[result.last].label)}</p>
      {result.rows.length === 0 ? <p className="empty">{R.changesNone}</p> : (
        <ul className="changes">
          {result.rows.map((c, i) => (
            <li key={i}>
              <button type="button" onClick={() => onPick(c)}>
                <span className={`kind kind-${c.kind.toLowerCase()}`}>{t(`chg.kind.${c.kind}`)}</span>
                <span className="changes-text"><strong>{changeAmountText(c.amount) || '–'}</strong><span>{changeWhereText(c.where)}</span></span>
                <span className="changes-go">{R.changesShow}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="t-caption c-3">{R.changesNote}</p>
    </div>
  );
}

// ---------------------------------------------------------------- candidates

interface CandProps {
  candidates: Candidate[];
  canSave: boolean;
  saved: boolean;
  onSave: () => void;
  onRemove: (id: string) => void;
}

function downloadCsv(list: Candidate[]) {
  const blob = new Blob([candidatesToCsv(list)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'spherex-candidates.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function CandidatesSection({ candidates, canSave, saved, onSave, onRemove }: CandProps) {
  useI18n();
  return (
    <div>
      <button type="button" className="btn btn-sm" disabled={!canSave || saved} onClick={onSave}>
        <Icon name={saved ? 'check' : 'star'} size={14} />{saved ? R.candSaved : R.candSave}
      </button>
      {!canSave && <p className="t-caption c-3">{R.candNeedMeasure}</p>}
      {candidates.length === 0 ? <p className="empty">{R.candEmpty}</p> : (
        <>
          <div className="tbl-scroll">
            <table className="mini">
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{formatRaFine(c.ra)}<br />{formatDecFine(c.dec)}</td>
                    <td className="c-3">{c.shiftArcsec !== null ? `${num(c.shiftArcsec, 1)}″` : '–'}<br />{c.band}</td>
                    <td className="num"><button type="button" className="btn-link" onClick={() => onRemove(c.id)}>{R.candRemove}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => downloadCsv(candidates)}><Icon name="copy" size={14} />{R.candExport}</button>
        </>
      )}
      <p className="t-caption c-3">{R.candNote}</p>
    </div>
  );
}

// ---------------------------------------------------------------- data panel

interface DataProps {
  patch: SkyPatch;
  epoch: number;
  band: number;
  fieldFlag: number | null;
  fieldNoData: number | null;
  group: GroupId;
}

export function DataSection({ patch, epoch, band, fieldFlag, fieldNoData, group }: DataProps) {
  const { t, lang } = useI18n();
  const ref = patch.noiseRefMJySr;
  const real = patch.source === 'irsa';
  const g = patch.grouping ?? GROUPINGS.find((x) => x.id === group);
  const noises: number[] = [];
  patch.noise.forEach((row, e) => row.forEach((n, b) => { if (!patch.missing?.[e]?.[b] && ref) noises.push(n * ref); }));
  const nShown = patch.noise[epoch][band] * (ref ?? 1);
  const totalExp = patch.imageCounts ? patch.imageCounts.flat().reduce((s, n) => s + n, 0) : null;
  const dr = patch.dataRelease;
  const sig = (v: number) => sigFmt(v, 3);
  return (
    <div>
      <dl className="facts">
        <dt>{R.data.source}</dt><dd>{real ? R.dataReal : R.dataDemo}</dd>
        <dt>{R.data.centre}</dt><dd>{num(patch.center.ra, 5)}, {patch.center.dec >= 0 ? '+' : '−'}{num(Math.abs(patch.center.dec), 5)}</dd>
        <dt>{R.data.fov}</dt><dd>{num(patch.fovDeg * 60, patch.fovDeg * 60 < 10 ? 1 : 0)}′ × {num(patch.fovDeg * 60, patch.fovDeg * 60 < 10 ? 1 : 0)}′</dd>
        <dt>{R.data.pixel}</dt><dd>{t('r.pixelsSize', { scale: num(patch.pixelScale, 3), size: patch.size })}</dd>
        <dt>{R.data.visits}</dt><dd>{patch.epochs.length}</dd>
        {g && <><dt>{R.data.grouping}</dt><dd>{t('r.groupingValue', { gap: g.gapDays, span: g.maxSpanDays })}</dd></>}
        {totalExp !== null && <><dt>{R.data.exposures}</dt><dd>{totalExp}</dd></>}
        {dr && Object.entries(dr.collections).map(([k, v]) => <Fragment key={k}><dt>{R.data.collections} · {k}</dt><dd>{v}</dd></Fragment>)}
        {dr?.latestMjd != null && <><dt>{R.data.latest}</dt><dd>{mjdToDateText(dr.latestMjd)}</dd></>}
        <dt>{R.data.unit}</dt><dd>{ref ? R.dataUnit : R.dataUnitDemo}</dd>
        {ref && <><dt>{R.data.noise}</dt><dd>{sig(nShown)} MJy/sr</dd></>}
        {ref && noises.length > 0 && <><dt>{R.data.noiseRange}</dt><dd>{sig(Math.min(...noises))} – {sig(Math.max(...noises))} MJy/sr</dd></>}
        <dt>{R.data.flagged}</dt><dd>{fieldFlag === null ? t('common.na') : flagPct(fieldFlag)}</dd>
        <dt>{R.data.nodata}</dt><dd>{fieldNoData === null ? t('common.na') : flagPct(fieldNoData)}</dd>
      </dl>
      {patch.warnings && patch.warnings.length > 0 && (
        <p className="note warn"><b>{R.data.warnings}:</b> {patch.warnings.join(' ')}{lang !== 'en' && <i> ({t('r.warningsNote')})</i>}</p>
      )}
      <p className="t-caption c-3">{R.dataFootnote}</p>
    </div>
  );
}
