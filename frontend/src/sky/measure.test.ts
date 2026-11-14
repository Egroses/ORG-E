import { beforeAll, describe, expect, it } from 'vitest';
import { setLang } from '../i18n';
import { describeMeasurement, measureBest, measureSource, sizeComparison } from './measure';
import { synthPatch } from '../test/synth';

beforeAll(() => setLang('en', false));

describe('measureSource', () => {
  it('follows a source moving north: smaller row numbers, positive north shift', () => {
    // 3 pixels over 400 days = 18.5 arcsec
    const patch = synthPatch([{ x: [20, 20, 20], y: [24, 22.5, 21], flux: [300, 300, 300] }]);
    const m = measureSource(patch, 2, { x: 20, y: 21 });
    expect(m.status).toBe('ok');
    expect(m.points.length).toBe(3);
    expect(m.points[0].y).toBeGreaterThan(m.points[2].y);
    expect(m.north).toBeGreaterThan(14);
    expect(Math.abs(m.east)).toBeLessThan(1.5);
    expect(m.shiftArcsec).toBeGreaterThan(14);
    expect(m.shiftArcsec).toBeLessThan(23);
    expect(m.moved).toBe(true);
    expect(m.rate).toBeGreaterThan(10);
    expect(describeMeasurement(m)).toMatch(/moved/);
  });
  it('moving toward smaller column numbers is east', () => {
    const patch = synthPatch([{ x: [24, 22, 20], y: [20, 20, 20], flux: [300, 300, 300] }]);
    const m = measureSource(patch, 2, { x: 20, y: 20 });
    expect(m.east).toBeGreaterThan(15);
  });
  it('reports a static star as not moved', () => {
    const patch = synthPatch([{ x: [20, 20, 20], y: [20, 20, 20], flux: [300, 300, 300] }]);
    const m = measureSource(patch, 2, { x: 20, y: 20 });
    expect(m.status).toBe('ok');
    expect(m.moved).toBe(false);
    expect(m.shiftArcsec).toBeLessThan(2);
    expect(describeMeasurement(m)).toMatch(/stayed put/);
  });
  it('says so when nothing is there', () => {
    const patch = synthPatch([]);
    const m = measureBest(patch, { x: 20, y: 20 });
    expect(m.status).toBe('faint');
    expect(describeMeasurement(m)).toMatch(/could not find/);
  });
  it('treats a flagged, saturated core as a hole and measures the wings (approximate)', () => {
    const patch = synthPatch([{ x: [20, 20, 20], y: [20, 20, 20], flux: [5000, 5000, 5000] }]);
    for (let e = 0; e < 3; e++) {
      for (const b of [0, 1, 2]) {
        for (let j = 18; j <= 22; j++) {
          for (let i = 18; i <= 22; i++) {
            if (Math.hypot(i - 20, j - 20) <= 2.2) patch.flags[e][b][j * 41 + i] = 1;
          }
        }
      }
    }
    const m = measureSource(patch, 2, { x: 20, y: 20 });
    expect(m.status).toBe('ok');
    expect(m.saturated).toBe(true);
    expect(describeMeasurement(m)).toMatch(/approximate/);
  });
  it('uses the longest band first and skips epochs with no photo', () => {
    const patch = synthPatch([{ x: [20, 20, 20], y: [20, 20, 20], flux: [300, 300, 300] }]);
    patch.missing = [[false, false, false], [false, false, true], [false, false, false]];
    const m = measureBest(patch, { x: 20, y: 20 });
    expect(m.band).toBe(2);
    expect(m.points.map((p) => p.epoch)).toEqual([0, 2]);
  });
});

describe('sizeComparison', () => {
  it('uses familiar objects', () => {
    expect(sizeComparison(40)).toMatch(/Jupiter/);
    expect(sizeComparison(900)).toMatch(/Moon/);
  });
});
