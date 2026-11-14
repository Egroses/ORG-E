import type { Band, BandId, Epoch, KnownObject, TargetId } from './types';

/** Three detectors offered as "infrared goggles" stops. Ranges are SPHEREx channel centres. */
export const BANDS: Band[] = [
  { id: 'D2', label: '1.4 µm', name: 'Short', rangeUm: [1.11, 1.63], color: '#6CB8FF', tint: [200, 222, 255] },
  { id: 'D4', label: '3.1 µm', name: 'Middle', rangeUm: [2.45, 3.77], color: '#3DDC97', tint: [232, 240, 236] },
  { id: 'D6', label: '4.7 µm', name: 'Long', rangeUm: [4.44, 4.99], color: '#FF8A4C', tint: [255, 206, 160] },
];

/** SPHEREx epochs covering WISE 0855 in DR1 (measured from IRSA on 2026-11-14). */
export const EPOCHS: Epoch[] = [
  { index: 0, label: 'May 2025', dates: '5–6 May 2025', mjd: 60801.1, imageCount: 30 },
  { index: 1, label: 'Nov 2025', dates: '31 Oct – 13 Dec 2025', mjd: 61001.0, imageCount: 128 },
  { index: 2, label: 'May 2026', dates: '21 Apr – 14 May 2026', mjd: 61162.7, imageCount: 100 },
];

// Positions and proper motions are approximate literature values; verify against SIMBAD/Gaia DR3
// before quoting numbers in the submission.
export const KNOWN: Record<TargetId, KnownObject> = {
  barnard: {
    id: 'barnard', name: 'Barnard’s Star',
    ra: 269.452083, dec: 4.693389, refYear: 2000.0, pmRa: -802, pmDec: 10362,
    snr: { D2: 900, D4: 420, D6: 260 }, variability: [1, 1, 1],
    fact: 'Barnard’s Star is a small red dwarf about 6 light-years away. It crosses the sky faster than any other star.',
  },
  wise0855: {
    id: 'wise0855', name: 'WISE 0855',
    // The challenge gives the AllWISE designation position, which is for about epoch 2010.5.
    ra: 133.795125, dec: -7.245139, refYear: 2010.5, pmRa: -8118, pmDec: 673,
    snr: { D2: 0.5, D4: 6, D6: 45 }, variability: [1, 1, 1],
    fact: 'WISE 0855 is one of the coldest brown dwarfs known, about 7.4 light-years away. It barely shows at short wavelengths and glows at long ones.',
  },
  epsindb: {
    id: 'epsindb', name: 'Epsilon Indi B',
    ra: 331.043833, dec: -56.782694, refYear: 2000.0, pmRa: 3966, pmDec: -2536,
    snr: { D2: 30, D4: 12, D6: 18 }, variability: [1, 1, 1],
    fact: 'Epsilon Indi B is a pair of brown dwarfs, too close together for SPHEREx to split, about 12 light-years away.',
  },
  rwaur: {
    id: 'rwaur', name: 'RW Aurigae',
    ra: 76.956417, dec: 30.401417, refYear: 2000.0, pmRa: 0, pmDec: 0,
    snr: { D2: 70, D4: 55, D6: 50 }, variability: [1.0, 0.55, 1.15],
    fact: 'RW Aurigae is a young star still wrapped in dust. Clumps of dust pass in front of it, so it fades and recovers.',
  },
  rdra: {
    id: 'rdra', name: 'R Draconis',
    ra: 248.167458, dec: 66.754972, refYear: 2000.0, pmRa: 0, pmDec: 0,
    snr: { D2: 160, D4: 90, D6: 60 }, variability: [0.45, 1.0, 0.65],
    fact: 'R Draconis is a red giant that swells and shrinks over about 245 days. Three photos catch it changing, not its whole cycle.',
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
    id: 'barnard', n: 1, nick: 'The Speedster', mission: 'Catch the fastest-moving star in our sky.',
    goal: 'One star in these photos moves far enough in a year to see. Find it.',
    step: 'Watch all three photos flip. Follow one dot at a time.', check: 'seen',
    tool: 'flip', color: '#FFC53D', difficulty: 1, startBand: 'D2',
  },
  {
    id: 'wise0855', n: 2, nick: 'The Cold One', mission: 'Find something too cold to be a star.',
    goal: 'Find a brown dwarf: too cold to shine like a star, it glows only in long-wavelength infrared.',
    step: 'Switch the goggles to 4.7 µm. Look for a dot that is missing at 1.4 µm.', check: 'long',
    tool: 'goggles', color: '#6CB8FF', difficulty: 2, startBand: 'D2',
  },
  {
    id: 'epsindb', n: 3, nick: 'The Twins', mission: 'Two brown dwarfs, one tiny step.',
    goal: 'Find two brown dwarfs that look like one dot. They shift by less than one pixel.',
    step: 'Open Detail and turn on Magnifier and Pixel grid.', check: 'detail',
    tool: 'detail', color: '#FF7AB6', difficulty: 3, startBand: 'D2',
  },
  {
    id: 'rwaur', n: 4, nick: 'The Flicker', mission: 'A young star that will not sit still.',
    goal: 'Find a young star that stays in place but changes brightness.',
    step: 'Open Compare and choose Changes only. Look for a spot that keeps lighting up.', check: 'diff',
    tool: 'compare', color: '#3DDC97', difficulty: 2, startBand: 'D2',
  },
  {
    id: 'rdra', n: 5, nick: 'The Pulse', mission: 'A giant star that breathes.',
    goal: 'Find the giant star that changes, then decide: did it move, or did its brightness change?',
    step: 'Watch all three photos and compare how bright each dot is.', check: 'seen',
    tool: 'flip', color: '#B59CFF', difficulty: 2, startBand: 'D2',
  },
];

export const FOV_OPTIONS = [
  { value: 0.05, name: 'Small', sub: '0.05°' },
  { value: 0.1, name: 'Medium', sub: '0.1°' },
  { value: 0.25, name: 'Large', sub: '0.25°' },
];

export const PIXEL_SCALE = 6.15;
