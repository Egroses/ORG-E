// Language choice: ?lang= in the address > saved choice > Turkish if the browser says Turkish > English.
// The address wins so that a shared link such as ?lang=tr opens in that language even if the visitor chose another before.

export type Lang = 'en' | 'tr';
export const LANGS: readonly Lang[] = ['tr', 'en'];
export const LANG_KEY = 'skyquest.lang.v1';

const isLang = (v: unknown): v is Lang => v === 'en' || v === 'tr';

/** Pure resolution, so it can be tested without a browser. */
export function resolveLang(input: { saved?: string | null; url?: string | null; browser?: string | null }): Lang {
  const url = input.url?.toLowerCase();
  if (isLang(url)) return url;
  if (isLang(input.saved)) return input.saved;
  return input.browser?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

function savedLang(): string | null {
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

function urlLang(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('lang');
  } catch {
    return null;
  }
}

export function detectLang(): Lang {
  return resolveLang({
    saved: savedLang(),
    url: urlLang(),
    browser: typeof navigator !== 'undefined' ? navigator.language : null,
  });
}

let current: Lang = detectLang();
const listeners = new Set<() => void>();

export const getLang = () => current;

export function subscribeLang(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Sets the language, remembers it and tells every listener. `remember: false` is for tests. */
export function setLang(lang: Lang, remember = true) {
  if (remember) {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // storage blocked: the choice lasts for this visit only
    }
  }
  if (lang === current) return;
  current = lang;
  listeners.forEach((fn) => fn());
}
