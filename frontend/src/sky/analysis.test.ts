import { beforeAll, describe, expect, it } from 'vitest';
import { answerKey, truthText } from './analysis';
import { setLang } from '../i18n';
import { synthPatch } from '../test/synth';
import type { KnownObject, SkyPatch } from '../data/types';

// The sentences are checked in English; the other language is covered in i18n.test.ts.
beforeAll(() => setLang('en', false));

// Patch centre (100, 20), 41 x 41 pixels: a still object at RA 100, Dec 20 sits at pixel (20, 20).
const still = (over: Partial<KnownObject> = {}): KnownObject => ({
  id: 'rwaur', name: 'Test star', ra: 100, dec: 20, refYear: 2000, pmRa: 0, pmDec: 0,
  snr: { D2: 100, D4: 50, D6: 10 }, variability: [1, 1, 1], fact: '', ...over,
});

const blobPatch = (flux: number[]): SkyPatch =>
  synthPatch([{ x: [20, 20, 20], y: [20, 20, 20], flux }]);

const flagBand = (patch: SkyPatch, bandIndex: number) => {
  for (const epoch of patch.flags) epoch[bandIndex].fill(1);
};

describe('answerKey on saturated stars (real-data finding: Barnard\'s Star looked 34% brighter at 1.4 µm)', () => {
  it('ignores a saturated band even when the catalogue says it has the best signal', () => {
    const patch = blobPatch([300, 300, 300]);
    for (let i = 0; i < patch.frames[2][0].length; i++) patch.frames[2][0][i] *= 1.4; // artefact in D2 only
    flagBand(patch, 0); // D2 saturated
    flagBand(patch, 1); // D4 saturated
    const key = answerKey(patch, still());
    expect(key.bestBand).toBe('D6');
    expect(key.reliable).toBe(true);
    expect(key.accepted).not.toContain('bright');
    expect(key.accepted).toContain('noclear');
  });

  it('still detects a real brightness change in an unsaturated band', () => {
    const key = answerKey(blobPatch([300, 150, 450]), still());
    expect(key.reliable).toBe(true);
    expect(key.accepted).toContain('bright');
    expect(key.changePct).toBeGreaterThan(50);
  });

  it('says so when every band is saturated, and does not invent a brightness change', () => {
    const patch = blobPatch([300, 300, 300]);
    [0, 1, 2].forEach((b) => flagBand(patch, b));
    const key = answerKey(patch, still());
    expect(key.reliable).toBe(false);
    expect(key.accepted).not.toContain('bright');
    expect(truthText(key)).toMatch(/saturates/);
  });

  it('falls back on catalogue knowledge for a saturated star that astronomers know to be variable', () => {
    const patch = blobPatch([300, 300, 300]);
    [0, 1, 2].forEach((b) => flagBand(patch, b));
    const key = answerKey(patch, still({ variable: true }));
    expect(key.reliable).toBe(false);
    expect(key.accepted).toContain('bright');
    expect(truthText(key)).toMatch(/know it as a star that changes brightness/);
  });

  it('never prefers a band without a photo (all-flagged frame)', () => {
    const patch = blobPatch([300, 300, 300]);
    flagBand(patch, 0); // pretend D2 has no photo
    const key = answerKey(patch, still({ snr: { D2: 999, D4: 50, D6: 10 } }));
    expect(key.bestBand).toBe('D4');
  });
});
