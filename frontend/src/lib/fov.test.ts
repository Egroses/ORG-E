import { describe, expect, it } from 'vitest';
import { arcminToDeg, checkFovArcmin, exceedsSaved, maxFovDeg, parseFovDeg } from './fov';

describe('field size', () => {
  it('turns arcminutes into degrees with four decimals', () => {
    expect(arcminToDeg(6)).toBe(0.1);
    expect(arcminToDeg(3)).toBe(0.05);
    expect(arcminToDeg(15)).toBe(0.25);
    expect(arcminToDeg(8)).toBe(0.1333);
  });
  it('clamps typed values to 3-15 arcminutes and says when it did', () => {
    expect(checkFovArcmin('10')).toEqual({ ok: true, arcmin: 10, deg: 0.1667, clamped: false });
    expect(checkFovArcmin('1')).toMatchObject({ ok: true, arcmin: 3, clamped: true });
    expect(checkFovArcmin('40')).toMatchObject({ ok: true, arcmin: 15, deg: 0.25, clamped: true });
    expect(checkFovArcmin(' 7,5 ')).toMatchObject({ ok: true, arcmin: 7.5, clamped: false });
  });
  it('refuses text that is not a number', () => {
    expect(checkFovArcmin('')).toEqual({ ok: false });
    expect(checkFovArcmin('abc')).toEqual({ ok: false });
    expect(checkFovArcmin('Infinity')).toEqual({ ok: false });
  });
  it('keeps any field the service accepts when it is read from the address', () => {
    expect(parseFovDeg('0.1333')).toBe(0.1333);
    expect(parseFovDeg('0.25')).toBe(0.25);
    expect(parseFovDeg('0.01')).toBe(0.05);
    expect(parseFovDeg('9')).toBe(0.25);
    expect(parseFovDeg(null)).toBe(0.1);
    expect(parseFovDeg('x')).toBe(0.1);
  });
  it('knows when a field is wider than the saved cutouts', () => {
    expect(exceedsSaved(0.1)).toBe(false);
    expect(exceedsSaved(0.05)).toBe(false);
    expect(exceedsSaved(0.1333)).toBe(true);
    expect(exceedsSaved(0.25)).toBe(true);
  });
});

describe('field limit of a saved target', () => {
  it('a saved target is limited to the 6 arcminutes it has data for, any other position to 15', () => {
    expect(maxFovDeg(true)).toBe(0.1);
    expect(maxFovDeg(false)).toBe(0.25);
  });
  it('typed values are clamped to the limit that is given', () => {
    expect(checkFovArcmin('15', 6)).toMatchObject({ ok: true, arcmin: 6, clamped: true });
    expect(checkFovArcmin('5', 6)).toMatchObject({ ok: true, arcmin: 5, clamped: false });
    expect(checkFovArcmin('15')).toMatchObject({ ok: true, arcmin: 15, clamped: false });
  });
});
