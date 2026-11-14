import { describe, expect, it } from 'vitest';
import { findChanges } from './changes';
import { synthPatch } from '../test/synth';

describe('findChanges', () => {
  it('finds a brightening source that stays in place, and ignores a steady star', () => {
    const patch = synthPatch([
      { x: [10, 10, 10], y: [30, 30, 30], flux: [400, 400, 400] },
      { x: [30, 30, 30], y: [12, 12, 12], flux: [60, 200, 400] },
    ]);
    const r = findChanges(patch, 2);
    expect(r.single).toBe(false);
    const hit = r.rows.find((x) => Math.hypot(x.x - 30, x.y - 12) < 2);
    expect(hit?.kind).toBe('Brightened');
    expect(r.rows.some((x) => Math.hypot(x.x - 10, x.y - 30) < 2)).toBe(false);
  });
  it('finds a fading source', () => {
    const patch = synthPatch([{ x: [20, 20, 20], y: [20, 20, 20], flux: [500, 300, 60] }]);
    const r = findChanges(patch, 2);
    expect(r.rows[0]?.kind).toBe('Faded');
  });
  it('finds a mover and calls it Moved', () => {
    const patch = synthPatch([{ x: [20, 20, 20], y: [28, 24, 20], flux: [400, 400, 400] }]);
    const r = findChanges(patch, 2);
    expect(r.rows.some((x) => x.kind === 'Moved')).toBe(true);
  });
  it('reports a single photo plainly', () => {
    const patch = synthPatch([], { mjds: [1000] });
    expect(findChanges(patch, 2).single).toBe(true);
  });
});
