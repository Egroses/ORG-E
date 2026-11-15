import { translate } from '../i18n';
import { verdictText, type SourceRef } from '../sky/catalogue';

type K = Parameters<typeof translate>[1];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const en = (k: K) => translate('en', k);

/** Regex for an English template: each {placeholder} becomes a capture group (in order). */
function templateRe(key: K, lazyLast = false): RegExp {
  const body = esc(en(key)).replace(/\\\{(\w+)\\\}/g, (_m, name: string) => (name === 'rate' || name === 'g' ? '([0-9.,]+)' : lazyLast ? '(.+)' : '(.+?)'));
  return new RegExp(`^${body}$`);
}

const num = (s: string) => Number(s.replace(',', '.'));

/**
 * Candidates saved before verdicts were stored as data only have the English sentence. In another language, take that
 * sentence apart again (it was made from fixed templates) and word it in the current language. A sentence that does
 * not fit any template is returned as it was saved.
 */
export function legacyVerdictText(text: string): string {
  if (text === en('verdict.unmeasured')) return verdictText({ kind: 'unmeasured', source: null, catRate: null, moves: null });
  if (text === en('verdict.none')) return verdictText({ kind: 'none', source: null, catRate: null, moves: null });
  for (const kind of ['match', 'mismatch'] as const) {
    const m = templateRe(kind === 'match' ? 'verdict.match' : 'verdict.mismatch').exec(text);
    if (!m) continue;
    const rate = templateRe('verdict.moves').exec(m[2]);
    const moves = rate ? 'rate' : m[2] === en('verdict.still') ? 'still' : null;
    if (!moves) continue;
    const gaia = templateRe('cat.gaiaStarG').exec(m[1]) ?? templateRe('cat.gaiaStar', true).exec(m[1]);
    const source: SourceRef = gaia
      ? { name: gaia[1], origin: 'gaia', gmag: gaia[2] ? num(gaia[2]) : null }
      : { name: m[1], origin: 'known', gmag: null };
    return verdictText({ kind, source, catRate: rate ? num(rate[1]) : null, moves });
  }
  return text;
}
