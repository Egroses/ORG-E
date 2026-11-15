// Data contract shared by the mock provider and the future real (IRSA-backed) provider.
// The backend only has to return a SkyPatch with this shape for the UI to work unchanged.

/** SPHEREx has six detectors, D1 (shortest wavelength) to D6 (longest). The game only uses D2, D4 and D6. */
export type BandId = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6';
export type GameBandId = 'D2' | 'D4' | 'D6';

export interface Band {
  id: BandId;
  /** Short label shown on the goggles control, e.g. "4.7 µm". */
  label: string;
  /** Plain-language stop name: Short / Middle / Long (in the current language). */
  readonly name: string;
  rangeUm: [number, number];
  /** Accent colour for this band in the UI. */
  color: string;
  /** RGB tint used when painting the image in this band. */
  tint: [number, number, number];
}

export interface Epoch {
  index: number;
  /** Short label, e.g. "Nov 2025" / "Kas 2025". Computed from the dates in the current language, never taken from the server. */
  readonly label: string;
  /** Observation window, e.g. "31 Oct – 13 Dec 2025". Computed like `label`. */
  readonly dates: string;
  /** Start and end of the observation window (Modified Julian Date). */
  mjdStart: number;
  mjdEnd: number;
  /** Mean date of the observation window (Modified Julian Date). */
  mjd: number;
  /** Raw SPHEREx images stacked into this epoch (all detectors). */
  imageCount: number;
}

export interface SkyPatch {
  /** Field centre in degrees (ICRS). */
  center: { ra: number; dec: number };
  fovDeg: number;
  /** Pixels per side. Images are square, north up, east left. */
  size: number;
  /** Arcseconds per pixel (SPHEREx: 6.15). */
  pixelScale: number;
  epochs: Epoch[];
  bands: Band[];
  /** frames[epoch][band], row-major size*size, in units of the background noise of a reference stack. */
  frames: Float32Array[][];
  /** flags[epoch][band], 1 = pixel flagged as unreliable. */
  flags: Uint8Array[][];
  /** noise[epoch][band], 1-sigma background noise in the same units as frames. */
  noise: number[][];
  /** missing[epoch][band] = true when that band has no photo on that date (real data only). */
  missing?: boolean[][];
  /** nodata[epoch][band][pixel] = 1 where the archive has no value (masked / NaN). Painted as hatched grey, never black. */
  nodata?: Uint8Array[][];
  /** Raw per-pixel flag share, 0-255 = share of the stacked exposures in which the pixel was flagged (real data only). */
  flagShare?: Uint8Array[][];
  /** Reference noise in MJy/sr: value in MJy/sr = frame value * noiseRefMJySr (real data only). */
  noiseRefMJySr?: number;
  /** Exposures used per archive collection, e.g. {dr1: 239, qr3: 119} (real data only). */
  dataRelease?: { collections: Record<string, number>; latestMjd: number | null };
  /** Visit grouping the patch was requested with (gap days / max span days), when known. */
  grouping?: { gapDays: number; maxSpanDays: number };
  /** Warnings the service attached to the answer. */
  warnings?: string[];
  /** Exposures stacked per [epoch][band] (real data only). */
  imageCounts?: number[][];
  source: 'mock' | 'irsa';
}

export interface PatchRequest {
  ra: number;
  dec: number;
  fovDeg: number;
  /** True for the five practice targets, which are pre-cached. */
  cached?: boolean;
  /**
   * How exposures are grouped into "photos" (visits). A visit ends after a gap longer than `gapDays`, or after
   * `maxSpanDays` without a gap. The practice cases ask for 30 / 60 so that every photo has all three bands.
   */
  gapDays?: number;
  maxSpanDays?: number;
  /** Detectors to request (1-6). Default 2,4,6, which is what the game uses. */
  dets?: number[];
  /** Realistic mode: never fall back to demo data when the real service fails or is down. */
  strict?: boolean;
}

export type LoadStep = 'finding' | 'downloading' | 'stacking' | 'done';

/** What the backend reports while it downloads a position that is not in the saved set. */
export interface LiveProgress {
  /** Images the backend has to read, done so far, and failed so far. `total` is 0 while it is still being counted. */
  total: number;
  done: number;
  failed: number;
  /** Optional: which detector the backend is working on (absent until the backend reports it). */
  detectorDone?: number;
  detectorTotal?: number;
  /** Date.now() when this load started, for the elapsed time. */
  startedAt: number;
}

export interface LoadOptions {
  /** Called on every 202 answer: only a position that is not saved takes this path. */
  onProgress?: (p: LiveProgress) => void;
  /** Stops polling when the visitor leaves the screen. */
  signal?: AbortSignal;
}

export interface SkyDataProvider {
  getPatch(req: PatchRequest, onStep?: (step: LoadStep) => void, opts?: LoadOptions): Promise<SkyPatch>;
}

export type TargetId = 'barnard' | 'wise0855' | 'epsindb' | 'rwaur' | 'rdra';

/** A catalogued object with a known position, motion and brightness. */
export interface KnownObject {
  id: TargetId;
  name: string;
  /** Catalogue position (degrees) at refYear. */
  ra: number;
  dec: number;
  refYear: number;
  /** Proper motion in mas/yr; pmRa already includes cos(dec). */
  pmRa: number;
  pmDec: number;
  /** Total flux per epoch stack, in noise units, per band. */
  snr: Record<string, number>; // keyed by BandId; only D2, D4, D6 are listed
  /** Multiplicative brightness per epoch. */
  variability: [number, number, number];
  /** True for stars astronomers know to change brightness. Used only when the photos are too saturated to measure it. */
  variable?: boolean;
  fact: string;
}

export type Chip = 'moved' | 'bright' | 'noclear' | 'unsure';
export type Outcome = 'great' | 'partial' | 'miss';
export type CompareMode = 'blink' | 'diff' | 'stack';
export type Detail = 'standard' | 'faint';
export interface Pt { x: number; y: number }
