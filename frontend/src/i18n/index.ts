// Tiny typed i18n layer: t(key, vars), tp(key, n, vars), useI18n() (in ./react). No dependency.

import { en } from './en';
import { tr, type Dict } from './tr';
import { getLang, type Lang } from './lang';

export type Key = keyof Dict;
type Vars = Record<string, string | number>;
export type PluralBase = { [K in Key]: K extends `${infer B}.one` ? B : never }[Key];

const DICTS: Record<Lang, Dict> = { en, tr };

export function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Translation in an explicit language (tests and non-reactive code). */
export function translate(lang: Lang, key: Key, vars?: Vars): string {
  return interpolate(DICTS[lang][key] ?? en[key] ?? key, vars);
}

/** Translation in the current language. */
export const t = (key: Key, vars?: Vars) => translate(getLang(), key, vars);

/** Plural category of a count. English has "one" and "other"; Turkish keeps the singular form after a number,
 *  so its "one" and "other" strings are the same and only the category lookup is shared. */
export function pluralCategory(lang: Lang, n: number): 'one' | 'other' {
  return new Intl.PluralRules(lang === 'tr' ? 'tr-TR' : 'en-US').select(n) === 'one' ? 'one' : 'other';
}

/** translatePlural('en', 'x', 3, {..}) picks "x.one" or "x.other". `n` is passed to the text too. */
export function translatePlural(lang: Lang, base: PluralBase, n: number, vars?: Vars): string {
  return translate(lang, `${base}.${pluralCategory(lang, n)}` as Key, { n, ...vars });
}
export const tp = (base: PluralBase, n: number, vars?: Vars) => translatePlural(getLang(), base, n, vars);

export { getLang, setLang, resolveLang, detectLang, LANGS, type Lang } from './lang';
export * from './format';
