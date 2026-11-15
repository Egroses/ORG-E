import { describe, expect, it } from 'vitest';
import { aladinUrl } from './format';

describe('aladinUrl', () => {
  it('has ra, dec, a field 1.5 times ours and the DSS2 colour survey from the IRSA mirror', () => {
    expect(aladinUrl(269.446271, 4.768197, 0.1)).toBe(
      'https://aladin.cds.unistra.fr/AladinLite/?ra=269.44627&dec=4.76820&fov=0.150&hips=https%3A%2F%2Firsa.ipac.caltech.edu%2Fdata%2Fhips%2FCDS%2FDSS2%2Fcolor',
    );
  });
  it('writes a negative declination with its own minus sign', () => {
    expect(aladinUrl(331.096658, -56.800657, 0.05)).toContain('ra=331.09666&dec=-56.80066&fov=0.075');
  });
});
