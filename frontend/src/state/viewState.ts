// Everything that makes a Realistic-mode view shareable lives in the address, so a copied link reopens the same picture.
// Parameters (all optional): view=realistic band=D5 visit=2 ref=1 mode=blink|diff|stack stretch=linear|asinh|sqrt|log
// lo=5 hi=99.5 (percent cuts) group=fine|normal|coarse layer=none|flags|heavy speed=0.5|1|2 invert=1.
// `visit` and `ref` count from 1. embed=1 asks for the stripped-down page that is meant for an iframe.

import type { BandId, CompareMode } from '../data/types';
import { ALL_BANDS, type GroupId } from '../data/catalog';
import type { StretchFn } from '../sky/render';

export type ViewMode = 'game' | 'realistic';
export type QualityLayer = 'none' | 'flagshare' | 'heavy';

export interface RealisticState {
  band?: BandId;
  /** Visit shown, 0-based. */
  visit?: number;
  /** Visit that Difference subtracts, 0-based. */
  ref?: number;
  mode: CompareMode;
  stretch: StretchFn;
  /** Low and high cut, percent of the valid pixels. */
  lo: number;
  hi: number;
  group: GroupId;
  quality: QualityLayer;
  /** Frames per second of the blink playback (0.5, 1 or 2). */
  speed?: number;
  /** Light background, dark image. */
  invert?: boolean;
}

export const DEFAULT_REALISTIC: RealisticState = { mode: 'blink', stretch: 'asinh', lo: 5, hi: 99.5, group: 'normal', quality: 'none' };

export const SPEEDS = [0.5, 1, 2];
const MODES: CompareMode[] = ['blink', 'diff', 'stack'];
const STRETCHES: StretchFn[] = ['linear', 'asinh', 'sqrt', 'log'];
const GROUPS: GroupId[] = ['fine', 'normal', 'coarse'];
const LAYERS: Record<string, QualityLayer> = { none: 'none', flags: 'flagshare', heavy: 'heavy' };
const LAYER_NAME: Record<QualityLayer, string> = { none: 'none', flagshare: 'flags', heavy: 'heavy' };

const pick = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const intOrUndef = (v: string | null) => {
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n - 1 : undefined;
};
const pctOr = (v: string | null, fallback: number) => {
  const n = v === null || v === '' ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback;
};

/** `embed=1` in the hash parameters: only the picture and its controls are drawn. */
export const parseEmbed = (params: URLSearchParams) => params.get('embed') === '1';

export function parseViewMode(params: URLSearchParams): ViewMode | null {
  const v = params.get('view');
  return v === 'realistic' || v === 'game' ? v : null;
}

export function parseRealistic(params: URLSearchParams): RealisticState {
  let lo = pctOr(params.get('lo'), DEFAULT_REALISTIC.lo);
  let hi = pctOr(params.get('hi'), DEFAULT_REALISTIC.hi);
  if (hi - lo < 1) { lo = DEFAULT_REALISTIC.lo; hi = DEFAULT_REALISTIC.hi; }
  const band = params.get('band');
  return {
    band: ALL_BANDS.some((b) => b.id === band) ? (band as BandId) : undefined,
    visit: intOrUndef(params.get('visit')),
    ref: intOrUndef(params.get('ref')),
    mode: pick(params.get('mode'), MODES, DEFAULT_REALISTIC.mode),
    stretch: pick(params.get('stretch'), STRETCHES, DEFAULT_REALISTIC.stretch),
    lo, hi,
    group: pick(params.get('group'), GROUPS, DEFAULT_REALISTIC.group),
    quality: LAYERS[params.get('layer') ?? ''] ?? 'none',
    speed: SPEEDS.includes(Number(params.get('speed'))) ? Number(params.get('speed')) : undefined,
    invert: params.get('invert') === '1' ? true : undefined,
  };
}

/** Query-string pairs for a state. Defaults are left out, so links stay short. */
export function realisticPairs(s: RealisticState): [string, string][] {
  const out: [string, string][] = [['view', 'realistic']];
  if (s.band) out.push(['band', s.band]);
  if (s.visit !== undefined) out.push(['visit', String(s.visit + 1)]);
  if (s.mode !== DEFAULT_REALISTIC.mode) out.push(['mode', s.mode]);
  if (s.mode === 'diff' && s.ref !== undefined) out.push(['ref', String(s.ref + 1)]);
  if (s.stretch !== DEFAULT_REALISTIC.stretch) out.push(['stretch', s.stretch]);
  if (s.lo !== DEFAULT_REALISTIC.lo) out.push(['lo', String(s.lo)]);
  if (s.hi !== DEFAULT_REALISTIC.hi) out.push(['hi', String(s.hi)]);
  if (s.group !== DEFAULT_REALISTIC.group) out.push(['group', s.group]);
  if (s.quality !== 'none') out.push(['layer', LAYER_NAME[s.quality]]);
  if (s.speed !== undefined && s.speed !== 1) out.push(['speed', String(s.speed)]);
  if (s.invert) out.push(['invert', '1']);
  return out;
}

// ---- remembered mode (localStorage) ----
const KEY = 'skyquest.mode.v1';

export function loadViewMode(): ViewMode {
  try {
    return localStorage.getItem(KEY) === 'realistic' ? 'realistic' : 'game';
  } catch {
    return 'game';
  }
}

export function saveViewMode(m: ViewMode) {
  try {
    localStorage.setItem(KEY, m);
  } catch {
    // storage blocked: the mode simply is not remembered
  }
}
