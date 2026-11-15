import { describe, expect, it } from 'vitest';
import { DEFAULT_REALISTIC, parseEmbed, parseRealistic, realisticPairs } from './viewState';
import { iframeSnippet } from '../lib/embedCode';

const params = (s: string) => new URLSearchParams(s);

describe('embed parameters', () => {
  it('embed=1 turns the embedded page on, nothing else does', () => {
    expect(parseEmbed(params('ra=1&dec=2&embed=1'))).toBe(true);
    expect(parseEmbed(params('ra=1&dec=2'))).toBe(false);
    expect(parseEmbed(params('embed=0'))).toBe(false);
    expect(parseEmbed(params('embed=true'))).toBe(false);
  });

  it('reads band, visit, speed, mode and invert from the address', () => {
    const s = parseRealistic(params('view=realistic&band=D3&visit=2&mode=diff&ref=1&speed=2&invert=1&stretch=sqrt&lo=10&hi=99'));
    expect(s).toMatchObject({ band: 'D3', visit: 1, mode: 'diff', ref: 0, speed: 2, invert: true, stretch: 'sqrt', lo: 10, hi: 99 });
  });

  it('ignores a speed that is not offered and an invert that is not 1', () => {
    const s = parseRealistic(params('speed=7&invert=yes'));
    expect(s.speed).toBeUndefined();
    expect(s.invert).toBeUndefined();
  });

  it('writes speed and invert back, and leaves the defaults out', () => {
    const pairs = realisticPairs({ ...DEFAULT_REALISTIC, band: 'D2', visit: 0, speed: 0.5, invert: true });
    expect(pairs).toContainEqual(['speed', '0.5']);
    expect(pairs).toContainEqual(['invert', '1']);
    const plain = realisticPairs({ ...DEFAULT_REALISTIC, speed: 1, invert: false }).map(([k]) => k);
    expect(plain).not.toContain('speed');
    expect(plain).not.toContain('invert');
  });

  it('survives a round trip through the address', () => {
    const state = { ...DEFAULT_REALISTIC, band: 'D5' as const, visit: 2, mode: 'stack' as const, speed: 2, invert: true };
    const back = parseRealistic(new URLSearchParams(realisticPairs(state)));
    expect(back).toMatchObject({ band: 'D5', visit: 2, mode: 'stack', speed: 2, invert: true });
  });
});

describe('iframeSnippet', () => {
  it('is the documented tag, with & written as &amp;', () => {
    const url = 'https://example.org/app/#/explore?ra=269.44627&dec=4.76820&fov=0.1&view=realistic&embed=1';
    expect(iframeSnippet(url)).toBe(
      '<iframe src="https://example.org/app/#/explore?ra=269.44627&amp;dec=4.76820&amp;fov=0.1&amp;view=realistic&amp;embed=1" width="480" height="540" style="border:0" loading="lazy" title="Sky Quest"></iframe>',
    );
  });
  it('cannot be broken out of by a quote in the address', () => {
    expect(iframeSnippet('https://x.org/#"><script>')).not.toContain('"><script>');
  });
});
