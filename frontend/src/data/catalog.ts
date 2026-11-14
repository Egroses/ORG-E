import type { Band, BandId, Epoch, KnownObject, TargetId } from './types';
import { num, t } from '../i18n';
import { makeEpochs } from './epochs';

// Texts that belong to data objects (band names, case texts, object names and facts) are getters that read the
// current language every time they are used, so components only need to re-render when the language changes.

/** All six SPHEREx detectors with their real wavelength ranges (micrometres) and display tints. */
export const ALL_BANDS: Band[] = [
  { id: 'D1', get label() { return `${num(0.9, 1)} µm`; }, get name() { return t('band.D1'); }, rangeUm: [0.75, 1.1], color: '#9B8CFF', tint: [206, 200, 255] },
  { id: 'D2', get label() { return `${num(1.4, 1)} µm`; }, get name() { return t('band.D2'); }, rangeUm: [1.1, 1.6], color: '#6CB8FF', tint: [200, 222, 255] },
  { id: 'D3', get label() { return `${num(2.0, 1)} µm`; }, get name() { return t('band.D3'); }, rangeUm: [1.6, 2.4], color: '#33CFCB', tint: [196, 240, 236] },
  { id: 'D4', get label() { return `${num(3.1, 1)} µm`; }, get name() { return t('band.D4'); }, rangeUm: [2.4, 3.8], color: '#3DDC97', tint: [232, 240, 236] },
  { id: 'D5', get label() { return `${num(4.1, 1)} µm`; }, get name() { return t('band.D5'); }, rangeUm: [3.8, 4.4], color: '#F2C14E', tint: [255, 230, 184] },
  { id: 'D6', get label() { return `${num(4.7, 1)} µm`; }, get name() { return t('band.D6'); }, rangeUm: [4.4, 5.0], color: '#FF8A4C', tint: [255, 206, 160] },
];

/** The three detectors the game offers as "infrared goggles" stops. */
export const BANDS: Band[] = ALL_BANDS.filter((b) => b.id === 'D2' || b.id === 'D4' || b.id === 'D6');

/** Visit grouping presets: an epoch ends after a gap longer than gapDays, or after maxSpanDays. */
export type GroupId = 'fine' | 'normal' | 'coarse';
export const GROUPINGS: { id: GroupId; name: string; gapDays: number; maxSpanDays: number }[] = [
  { id: 'fine', get name() { return t('group.fine'); }, gapDays: 10, maxSpanDays: 30 },
  { id: 'normal', get name() { return t('group.normal'); }, gapDays: 30, maxSpanDays: 60 },
  { id: 'coarse', get name() { return t('group.coarse'); }, gapDays: 60, maxSpanDays: 150 },
];

/** SPHEREx epochs covering WISE 0855 in DR1 (measured from IRSA on 2026-11-14). */
export const EPOCHS: Epoch[] = makeEpochs([
  { mjdStart: 60800, mjdEnd: 60801, mjd: 60801.1, imageCount: 30 },
  { mjdStart: 60979, mjdEnd: 61022, mjd: 61001.0, imageCount: 128 },
  { mjdStart: 61151, mjdEnd: 61174, mjd: 61162.7, imageCount: 100 },
]);

// Positions and proper motions are approximate literature values; verify against SIMBAD/Gaia DR3
// before quoting numbers in the submission.
export const KNOWN: Record<TargetId, KnownObject> = {
  barnard: {
    id: 'barnard', get name() { return t('obj.barnard.name'); },
    ra: 269.452083, dec: 4.693389, refYear: 2000.0, pmRa: -802, pmDec: 10362,
    snr: { D2: 900, D4: 420, D6: 260 }, variability: [1, 1, 1],
    get fact() { return t('obj.barnard.fact'); },
  },
  wise0855: {
    id: 'wise0855', get name() { return t('obj.wise0855.name'); },
    // The challenge gives the AllWISE designation position, which is for about epoch 2010.5.
    ra: 133.795125, dec: -7.245139, refYear: 2010.5, pmRa: -8118, pmDec: 673,
    snr: { D2: 0.5, D4: 6, D6: 45 }, variability: [1, 1, 1],
    get fact() { return t('obj.wise0855.fact'); },
  },
  epsindb: {
    id: 'epsindb', get name() { return t('obj.epsindb.name'); },
    ra: 331.043833, dec: -56.782694, refYear: 2000.0, pmRa: 3966, pmDec: -2536,
    snr: { D2: 30, D4: 12, D6: 18 }, variability: [1, 1, 1],
    get fact() { return t('obj.epsindb.fact'); },
  },
  rwaur: {
    id: 'rwaur', get name() { return t('obj.rwaur.name'); },
    ra: 76.956417, dec: 30.401417, refYear: 2000.0, pmRa: 0, pmDec: 0,
    snr: { D2: 70, D4: 55, D6: 50 }, variability: [1.0, 0.55, 1.15], variable: true,
    get fact() { return t('obj.rwaur.fact'); },
  },
  rdra: {
    id: 'rdra', get name() { return t('obj.rdra.name'); },
    ra: 248.167458, dec: 66.754972, refYear: 2000.0, pmRa: 0, pmDec: 0,
    snr: { D2: 160, D4: 90, D6: 60 }, variability: [0.45, 1.0, 0.65], variable: true,
    get fact() { return t('obj.rdra.fact'); },
  },
};

export type Tool = 'flip' | 'goggles' | 'detail' | 'compare';

/** What has to happen before step 1 of a case counts as done. */
export type StepCheck = 'seen' | 'long' | 'detail' | 'diff';

export interface CaseDef {
  id: TargetId;
  n: number;
  nick: string;
  /** One line for the case board. */
  mission: string;
  /** What the player is looking for, in plain words. */
  goal: string;
  /** First concrete action, tied to the tool this case introduces. */
  step: string;
  check: StepCheck;
  tool: Tool;
  color: string;
  difficulty: 1 | 2 | 3;
  startBand: BandId;
}

export const CASES: CaseDef[] = [
  {
    id: 'barnard', n: 1, get nick() { return t('case.barnard.nick'); }, get mission() { return t('case.barnard.mission'); },
    get goal() { return t('case.barnard.goal'); },
    get step() { return t('case.barnard.step'); }, check: 'seen',
    tool: 'flip', color: '#FFC53D', difficulty: 1, startBand: 'D2',
  },
  {
    id: 'wise0855', n: 2, get nick() { return t('case.wise0855.nick'); }, get mission() { return t('case.wise0855.mission'); },
    get goal() { return t('case.wise0855.goal'); },
    get step() { return t('case.wise0855.step'); }, check: 'long',
    tool: 'goggles', color: '#6CB8FF', difficulty: 2, startBand: 'D2',
  },
  {
    id: 'epsindb', n: 3, get nick() { return t('case.epsindb.nick'); }, get mission() { return t('case.epsindb.mission'); },
    get goal() { return t('case.epsindb.goal'); },
    get step() { return t('case.epsindb.step'); }, check: 'detail',
    tool: 'detail', color: '#FF7AB6', difficulty: 3, startBand: 'D2',
  },
  {
    id: 'rwaur', n: 4, get nick() { return t('case.rwaur.nick'); }, get mission() { return t('case.rwaur.mission'); },
    get goal() { return t('case.rwaur.goal'); },
    get step() { return t('case.rwaur.step'); }, check: 'diff',
    tool: 'compare', color: '#3DDC97', difficulty: 2, startBand: 'D2',
  },
  {
    id: 'rdra', n: 5, get nick() { return t('case.rdra.nick'); }, get mission() { return t('case.rdra.mission'); },
    get goal() { return t('case.rdra.goal'); },
    get step() { return t('case.rdra.step'); }, check: 'seen',
    tool: 'flip', color: '#B59CFF', difficulty: 2, startBand: 'D2',
  },
];

export const FOV_OPTIONS = [
  { value: 0.05, get name() { return t('fov.small'); }, get sub() { return `${num(0.05, 2)}°`; } },
  { value: 0.1, get name() { return t('fov.medium'); }, get sub() { return `${num(0.1, 1)}°`; } },
  { value: 0.25, get name() { return t('fov.large'); }, get sub() { return `${num(0.25, 2)}°`; } },
];

export const PIXEL_SCALE = 6.15;
