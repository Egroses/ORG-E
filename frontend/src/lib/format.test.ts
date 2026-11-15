import { describe, expect, it } from 'vitest';
import { aladinUrl } from './format';

describe('aladinUrl', () => {
  it('has the target, a field 1.5 times ours and the WISE colour survey', () => {
    expect(aladinUrl(269.446271, 4.768197, 0.1)).toBe(
      'https://aladin.cds.unistra.fr/AladinLite/?target=269.44627%20%2B4.76820&fov=0.150&survey=CDS%2FP%2FallWISE%2Fcolor',
    );
  });
  it('writes a negative declination with its own minus sign', () => {
    expect(aladinUrl(331.096658, -56.800657, 0.05)).toContain('target=331.09666%20-56.80066&fov=0.075');
  });
});
