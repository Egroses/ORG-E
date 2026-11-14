// Data contract shared by the mock provider and the future real (IRSA-backed) provider.
// The backend only has to return a SkyPatch with this shape for the UI to work unchanged.

export type BandId = 'D2' | 'D4' | 'D6';

export interface Band {
  id: BandId;
  /** Short label shown on the goggles control, e.g. "4.7 µm". */
  label: string;
  /** Plain-language stop name: Short / Middle / Long. */
  name: string;
  rangeUm: [number, number];
  /** Accent colour for this band in the UI. */
  color: string;
  /** RGB tint used when painting the image in this band. */
  tint: [number, number, number];
}

export interface Epoch {
  index: number;
  /** Short label, e.g. "Nov 2025". */
  label: string;
  /** Observation window, e.g. "31 Oct – 13 Dec 2025". */
  dates: string;
  /** Mid-point of the observation window (Modified Julian Date). */
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
  source: 'mock' | 'irsa';
}

export interface PatchRequest {
  ra: number;
  dec: number;
  fovDeg: number;
  /** True for the five practice targets, which are pre-cached. */
  cached?: boolean;
}

export type LoadStep = 'finding' | 'downloading' | 'stacking' | 'done';

export interface SkyDataProvider {
  getPatch(req: PatchRequest, onStep?: (step: LoadStep) => void): Promise<SkyPatch>;
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
  snr: Record<BandId, number>;
  /** Multiplicative brightness per epoch. */
  variability: [number, number, number];
  fact: string;
}

export type Chip = 'moved' | 'bright' | 'noclear' | 'unsure';
export type Outcome = 'great' | 'partial' | 'miss';
export type CompareMode = 'blink' | 'diff' | 'stack';
export type Detail = 'standard' | 'faint';
export interface Pt { x: number; y: number }
