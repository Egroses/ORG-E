// Every user-facing sentence of Realistic mode is a translation key (src/i18n/parts/realistic.ts). `R` reads them
// through getters, so each use gives the text in the language that is current at that moment. Components import `R`
// and never write prose inline. Keep it neutral: numbers and plain statements, no coaching, no similes.

import { num, sig, t } from '../i18n';
import { percentText } from '../lib/format';

const f1 = (v: number) => num(v, Math.abs(v) >= 10 ? 0 : 1);

/** Significant digits for a flux: 3 figures, never scientific for ordinary values. */
export const fluxText = (v: number) => {
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1000) return num(v, 0);
  if (a >= 100) return num(v, 1);
  if (a >= 1) return num(v, 2);
  return sig(v, 2);
};

const signed = (v: number, digits = 0) => `${v >= 0 ? '+' : '−'}${num(Math.abs(v), digits)}`;

export const R = {
  // ---- top bar, landing, gate ----
  get modeGame() { return t('r.modeGame'); },
  get modeRealistic() { return t('r.modeRealistic'); },
  get modeGameTitle() { return t('r.modeGameTitle'); },
  get modeRealisticTitle() { return t('r.modeRealisticTitle'); },
  get landingExplore() { return t('r.landingExplore'); },
  get gateTitle() { return t('r.gateTitle'); },
  get gateLead() { return t('r.gateLead'); },
  get gateHelp() { return t('r.gateHelp'); },
  get gateLoading() { return t('r.gateLoading'); },

  // ---- states ----
  loadError: (msg: string) => t('r.loadError', { msg }),
  get serviceDown() { return t('err.noService'); },
  get demoNotice() { return t('r.demoNotice'); },

  // ---- left panel ----
  get mapTitle() { return t('r.mapTitle'); },
  get mapSub() { return t('r.mapSub'); },
  get mapNoPhoto() { return t('r.mapNoPhoto'); },
  get mapHelp() { return t('r.mapHelp'); },
  get stepThrough() { return t('r.stepThrough'); },
  get stepEpochs() { return t('r.stepEpochs'); },
  get stepBands() { return t('r.stepBands'); },
  stepHelp: (axis: 'epochs' | 'bands') => t(axis === 'epochs' ? 'r.stepHelpEpochs' : 'r.stepHelpBands'),
  get legendTitle() { return t('r.legendTitle'); },
  get visitsTitle() { return t('r.visitsTitle'); },
  visitCols: {
    get visit() { return t('r.visitCols.visit'); },
    get window() { return t('r.visitCols.window'); },
    get mid() { return t('r.visitCols.mid'); },
    get exp() { return t('r.visitCols.exp'); },
    get stack() { return t('r.visitCols.stack'); },
  },
  get shownNow() { return t('r.shownNow'); },
  shown: {
    get visit() { return t('r.shown.visit'); },
    get window() { return t('r.shown.window'); },
    get mid() { return t('r.shown.mid'); },
    get band() { return t('r.shown.band'); },
    get exposures() { return t('r.shown.exposures'); },
    get noise() { return t('r.shown.noise'); },
    get flagged() { return t('r.shown.flagged'); },
  },
  visitOf: (i: number, n: number, label: string) => t('r.visitOf', { label, i: i + 1, n }),
  get noExposures() { return t('r.noExposures'); },

  // ---- picture ----
  get imageLabel() { return t('r.imageLabel'); },
  get noPhotoChip() { return t('r.noPhotoChip'); },
  get stackLabel() { return t('r.stackLabel'); },
  diffMinus: (label: string) => t('r.diffMinus', { label }),
  exposuresN: (n: number) => t('r.exposuresN', { n }),
  stackExposures: (n: number) => t('r.stackExposures', { n }),
  get demoChip() { return t('r.demoChip'); },
  get hoverHint() { return t('r.hoverHint'); },
  get noDataLegend() { return t('r.noDataLegend'); },
  get flagLegend() { return t('r.flagLegend'); },
  get heavyLegend() { return t('r.heavyLegend'); },

  // ---- controls ----
  modes: {
    blink: { get name() { return t('r.modes.blink.name'); }, get sub() { return t('r.modes.blink.sub'); } },
    diff: { get name() { return t('r.modes.diff.name'); }, get sub() { return t('r.modes.diff.sub'); } },
    stack: { get name() { return t('r.modes.stack.name'); }, get sub() { return t('r.modes.stack.sub'); } },
  },
  get stretchTitle() { return t('r.stretchTitle'); },
  stretchNames: {
    get linear() { return t('r.stretchNames.linear'); },
    get asinh() { return t('r.stretchNames.asinh'); },
    get sqrt() { return t('r.stretchNames.sqrt'); },
    get log() { return t('r.stretchNames.log'); },
  },
  get lowCut() { return t('r.lowCut'); },
  get highCut() { return t('r.highCut'); },
  get cutHelp() { return t('r.cutHelp'); },
  get colorbarTitle() { return t('r.colorbarTitle'); },
  get colorbarNoUnits() { return t('r.colorbarNoUnits'); },
  get layerTitle() { return t('r.layerTitle'); },
  layers: {
    get none() { return t('r.layers.none'); },
    get flagshare() { return t('r.layers.flagshare'); },
    get heavy() { return t('r.layers.heavy'); },
  },
  layerHelp: {
    none: '',
    get flagshare() { return t('r.layerHelp.flagshare'); },
    get heavy() { return t('r.layerHelp.heavy'); },
  },
  get layerUnavailable() { return t('r.layerUnavailable'); },
  get grid() { return t('r.grid'); },
  get magnifier() { return t('r.magnifier'); },
  get catalogueMarks() { return t('r.catalogueMarks'); },
  get invert() { return t('r.invert'); },
  get reference() { return t('r.reference'); },
  get refTitle() { return t('r.refTitle'); },
  get play() { return t('r.play'); },
  get pause() { return t('r.pause'); },
  get speedLabel() { return t('r.speedLabel'); },
  get groupingTitle() { return t('r.groupingTitle'); },
  groupingNames: {
    get fine() { return t('group.fine'); },
    get normal() { return t('group.normal'); },
    get coarse() { return t('group.coarse'); },
  },
  groupingHelp: (gap: number, span: number) => t('r.groupingHelp', { gap, span }),
  get fovTitle() { return t('r.fovTitle'); },

  // ---- marked source ----
  get sourceTitle() { return t('r.sourceTitle'); },
  get sourceEmpty() { return t('r.sourceEmpty'); },
  get sourceNotFound() { return t('r.sourceNotFound'); },
  get sourceNoData() { return t('r.sourceNoData'); },
  get sourceOneVisit() { return t('r.sourceOneVisit'); },
  measuredIn: (bandId: string, range: string) => t('r.measuredIn', { bandId, range }),
  get clearMark() { return t('r.clearMark'); },
  rows: {
    get position() { return t('r.rows.position'); },
    get positionDeg() { return t('r.rows.positionDeg'); },
    get shift() { return t('r.rows.shift'); },
    get shiftErr() { return t('r.rows.shiftErr'); },
    get pm() { return t('r.rows.pm'); },
    get pmComp() { return t('r.rows.pmComp'); },
    get pa() { return t('r.rows.pa'); },
    get span() { return t('r.rows.span'); },
    get flagAperture() { return t('r.rows.flagAperture'); },
  },
  shiftValue: (v: number, e: number) => t('r.shiftValue', { v: f1(v), e: f1(e) }),
  pmValue: (v: number, e: number) => t('r.pmValue', { v: num(v, 2), e: num(e, 2) }),
  pmCompValue: (e: number, n: number) => t('r.pmCompValue', { e: signed(e), n: signed(n) }),
  paValue: (deg: number) => t('r.paValue', { deg: num(deg, 0) }),
  spanValue: (years: number) => t('r.spanValue', { v: num(years, 2) }),
  get notSignificant() { return t('r.notSignificant'); },
  get jumpy() { return t('r.jumpy'); },
  get saturatedSource() { return t('r.saturatedSource'); },
  get perVisitTitle() { return t('r.perVisitTitle'); },
  perVisitCols: {
    get visit() { return t('r.perVisitCols.visit'); },
    get centroid() { return t('r.perVisitCols.centroid'); },
    get err() { return t('r.perVisitCols.err'); },
    get flux() { return t('r.perVisitCols.flux'); },
  },
  perVisitFluxBand: (id: string) => t('r.perVisitFluxBand', { id }),

  // ---- photometry ----
  get photTitle() { return t('r.photTitle'); },
  photSubtitle: (apertureArcsec: number) => t('r.photSubtitle', { v: num(apertureArcsec, 1) }),
  get photColVisit() { return t('r.photColVisit'); },
  get photUnits() { return t('r.photUnits'); },
  photNoPhoto: '–',
  get photLowerLimit() { return t('r.photLowerLimit'); },
  get photErrNote() { return t('r.photErrNote'); },
  get photNeedsReal() { return t('r.photNeedsReal'); },
  get chartTitle() { return t('r.chartTitle'); },
  get chartLabel() { return t('r.chartLabel'); },
  get chartLegendLimit() { return t('r.chartLegendLimit'); },
  get chartNote() { return t('r.chartNote'); },
  get chartEmpty() { return t('r.chartEmpty'); },
  get ratioTitle() { return t('r.ratioTitle'); },
  get ratioNote() { return t('r.ratioNote'); },
  get ratioLimited() { return t('r.ratioLimited'); },
  ratioNone: '–',
  ratioBand: (num_: string, den: string) => `${num_}/${den}`,

  // ---- spectrum ----
  get spectrumTitle() { return t('r.spectrumTitle'); },
  get spectrumNeedMark() { return t('r.spectrumNeedMark'); },
  get spectrumLoading() { return t('r.spectrumLoading'); },
  get spectrumUnavailable() { return t('r.spectrumUnavailable'); },
  get spectrumEmpty() { return t('r.spectrumEmpty'); },
  get spectrumLabel() { return t('r.spectrumLabel'); },
  get spectrumNote() { return t('r.spectrumNote'); },

  // ---- catalogue ----
  get catTitle() { return t('r.catTitle'); },
  get catSourceGaia() { return t('r.catSourceGaia'); },
  get catSourceBuiltIn() { return t('r.catSourceBuiltIn'); },
  get catEmpty() { return t('r.catEmpty'); },
  catCols: {
    get name() { return t('r.catCols.name'); },
    get g() { return t('r.catCols.g'); },
    get pm() { return t('r.catCols.pm'); },
    get pos() { return t('r.catCols.pos'); },
  },
  catNoG: '–',
  get catClick() { return t('r.catClick'); },
  get catMatchTitle() { return t('r.catMatchTitle'); },
  get catMatchNone() { return t('r.catMatchNone'); },
  catMatch: (name: string, off: number, catRate: number, measured: number | null, agree: boolean) =>
    t('r.catMatch', { name, off: num(off, 1), catRate: num(catRate, 2) })
    + (measured !== null ? ' ' + t(agree ? 'r.catMatchMeasuredOk' : 'r.catMatchMeasuredNo', { measured: num(measured, 2) }) : ''),
  get trails() { return t('r.trails'); },
  showingBrightest: (n: number, total: number) => t('r.showingBrightest', { n, total }),

  // ---- changes ----
  get changesTitle() { return t('r.changesTitle'); },
  get changesSingle() { return t('r.changesSingle'); },
  changesBetween: (a: string, b: string) => t('r.changesBetween', { a, b }),
  get changesNone() { return t('r.changesNone'); },
  get changesNote() { return t('r.changesNote'); },
  get changesShow() { return t('r.changesShow'); },

  // ---- candidates ----
  get candTitle() { return t('r.candTitle'); },
  get candSave() { return t('r.candSave'); },
  get candSaved() { return t('r.candSaved'); },
  get candEmpty() { return t('r.candEmpty'); },
  get candNote() { return t('r.candNote'); },
  get candExport() { return t('r.candExport'); },
  get candRemove() { return t('r.candRemove'); },
  get candNeedMeasure() { return t('r.candNeedMeasure'); },

  // ---- data panel ----
  get dataTitle() { return t('r.dataTitle'); },
  data: {
    get source() { return t('r.data.source'); },
    get centre() { return t('r.data.centre'); },
    get fov() { return t('r.data.fov'); },
    get pixel() { return t('r.data.pixel'); },
    get visits() { return t('r.data.visits'); },
    get grouping() { return t('r.data.grouping'); },
    get exposures() { return t('r.data.exposures'); },
    get collections() { return t('r.data.collections'); },
    get latest() { return t('r.data.latest'); },
    get noise() { return t('r.data.noise'); },
    get noiseRange() { return t('r.data.noiseRange'); },
    get flagged() { return t('r.data.flagged'); },
    get nodata() { return t('r.data.nodata'); },
    get unit() { return t('r.data.unit'); },
    get warnings() { return t('r.data.warnings'); },
  },
  get dataReal() { return t('r.dataReal'); },
  get dataDemo() { return t('r.dataDemo'); },
  get dataUnit() { return t('r.dataUnit'); },
  get dataUnitDemo() { return t('r.dataUnitDemo'); },
  get dataFootnote() { return t('r.dataFootnote'); },

  // ---- share ----
  get shareCopy() { return t('r.shareCopy'); },
  get shareCopied() { return t('r.shareCopied'); },
  get shareAladin() { return t('r.shareAladin'); },

  // ---- phone tabs ----
  tabs: {
    get find() { return t('r.tabs.find'); },
    get layers() { return t('r.tabs.layers'); },
    get map() { return t('r.tabs.map'); },
  },
};

/** A percentage without the sign, 1 decimal below 10. */
export const pctText = (v: number) => num(v, v >= 10 ? 0 : 1);
export const flagPct = (share: number) => percentText(share === 0 ? '0' : share < 0.01 ? '<1' : num(share * 100, 0));
