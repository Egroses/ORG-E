// Numbers and dates through Intl, in the current language. Turkish uses a decimal comma and Turkish month names.

import { getLang, type Lang } from './lang';

const LOCALE: Record<Lang, string> = { en: 'en-US', tr: 'tr-TR' };

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(lang: Lang, opts: Intl.NumberFormatOptions) {
  const k = lang + JSON.stringify(opts);
  let f = nfCache.get(k);
  if (!f) { f = new Intl.NumberFormat(LOCALE[lang], { useGrouping: false, ...opts }); nfCache.set(k, f); }
  return f;
}

/** Fixed number of decimals: num(10.24, 1) is "10.2" in English and "10,2" in Turkish. */
export function num(v: number, digits = 1, lang: Lang = getLang()): string {
  return nf(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

/** Significant figures, like toPrecision but with the language's decimal mark. */
export function sig(v: number, figures: number, lang: Lang = getLang()): string {
  return nf(lang, { minimumSignificantDigits: figures, maximumSignificantDigits: figures }).format(v);
}

/** Swaps the decimal point of an already formatted number for the language's mark (for strings built with toFixed/toPrecision). */
export const dec = (s: string, lang: Lang = getLang()) => (lang === 'tr' ? s.replace('.', ',') : s);

/** Whole number. */
export const int = (v: number, lang: Lang = getLang()) => nf(lang, { maximumFractionDigits: 0 }).format(v);

// ---- dates (all from Modified Julian Dates, UTC) ----

const DASH = '–';
const dateOf = (mjd: number) => new Date(Math.floor(mjd - 40587) * 86400000);

const monthCache = new Map<string, string>();
function monthName(d: Date, lang: Lang): string {
  const key = `${lang}${d.getUTCMonth()}`;
  let s = monthCache.get(key);
  if (!s) {
    const parts = new Intl.DateTimeFormat(LOCALE[lang], { month: 'short', timeZone: 'UTC' }).formatToParts(d);
    s = (parts.find((p) => p.type === 'month')?.value ?? '').replace(/\.$/, '');
    monthCache.set(key, s);
  }
  return s;
}

/** "Aug 2025" / "Ağu 2025". */
export function monthYear(mjd: number, lang: Lang = getLang()): string {
  const d = dateOf(mjd);
  return `${monthName(d, lang)} ${d.getUTCFullYear()}`;
}

/** "13 Nov 2025" / "13 Kas 2025". */
export function dayMonthYear(mjd: number, lang: Lang = getLang()): string {
  const d = dateOf(mjd);
  return `${d.getUTCDate()} ${monthName(d, lang)} ${d.getUTCFullYear()}`;
}

/** The window of a visit: "15 Aug – 1 Oct 2025", "15 – 20 Aug 2025", "15 Aug 2025". Same rule as the backend, en dash. */
export function dateWindow(mjdStart: number, mjdEnd: number, lang: Lang = getLang()): string {
  const a = dateOf(mjdStart), b = dateOf(mjdEnd);
  const ma = monthName(a, lang), mb = monthName(b, lang);
  if (a.getTime() === b.getTime()) return `${a.getUTCDate()} ${ma} ${a.getUTCFullYear()}`;
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()} ${DASH} ${b.getUTCDate()} ${ma} ${a.getUTCFullYear()}`;
  if (a.getUTCFullYear() === b.getUTCFullYear()) return `${a.getUTCDate()} ${ma} ${DASH} ${b.getUTCDate()} ${mb} ${b.getUTCFullYear()}`;
  return `${a.getUTCDate()} ${ma} ${a.getUTCFullYear()} ${DASH} ${b.getUTCDate()} ${mb} ${b.getUTCFullYear()}`;
}

/** Labels of all visits from their mean dates: "Mon YYYY", with the day added when two visits share a month. */
export function visitLabels(mjdMeans: number[], lang: Lang = getLang()): string[] {
  const base = mjdMeans.map((m) => monthYear(m, lang));
  return mjdMeans.map((m, i) => (base.filter((x) => x === base[i]).length > 1 ? `${dateOf(m).getUTCDate()} ${base[i]}` : base[i]));
}
