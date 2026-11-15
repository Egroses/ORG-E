/** Small display helpers (no science here). */

import { dayMonthYear, monthYear, num, sig, t } from '../i18n';

/** Modified Julian Date to "13 Nov 2025" / "13 Kas 2025" (UTC). */
export const mjdToDateText = dayMonthYear;

/** A percentage in the language's own style: "12%" in English, "%12" in Turkish. `n` is already formatted. */
export const percentText = (n: string) => t('fmt.percent', { n });

export const pct1 = (v: number) => percentText(num(v * 100, v > 0 && v < 0.001 ? 2 : v < 0.1 ? 1 : 0));

/**
 * Sky survey shown in Aladin Lite: DSS2 colour from IRSA's mirror of the CDS HiPS. Aladin's own default list points at the CDS server
 * (answered 404) and at ESA's mirror (timed out) on 15 Nov 2026, so the page stayed black; this address answers.
 */
export const ALADIN_HIPS = 'https://irsa.ipac.caltech.edu/data/hips/CDS/DSS2/color';

/**
 * Link that opens the same spot in Aladin Lite (CDS sky atlas), with a field 1.5 times ours so the surroundings show.
 * Aladin Lite reads `ra`, `dec`, `fov` (degrees) and `hips` (the address of a HiPS survey); a `target=` parameter is ignored
 * and the page opens at a random position.
 */
export function aladinUrl(ra: number, dec: number, fovDeg: number): string {
  return `https://aladin.cds.unistra.fr/AladinLite/?ra=${ra.toFixed(5)}&dec=${dec.toFixed(5)}&fov=${(fovDeg * 1.5).toFixed(3)}&hips=${encodeURIComponent(ALADIN_HIPS)}`;
}

/**
 * A surface brightness in MJy/sr with a sensible number of digits: 3 significant figures, scientific notation
 * only for very small or very large values. `unsigned` drops the sign (for uncertainties).
 */
export function formatMJySr(v: number, unsigned = false): string {
  if (!Number.isFinite(v)) return t('common.na');
  const a = Math.abs(v);
  const sign = unsigned ? '' : v < 0 ? '\u2212' : '';
  if (a === 0) return '0';
  if (a < 1e-3 || a >= 1e4) {
    const [m, e] = a.toExponential(2).split('e');
    return `${sign}${num(Number(m), 2)} × 10^${Number(e)}`;
  }
  return sign + sig(a, 3);
}

/** Modified Julian Date to "Nov 2025" (UTC), for chart axes. */
export const shortDate = monthYear;
