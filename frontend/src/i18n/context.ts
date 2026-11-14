import { createContext } from 'react';
import { t, tp } from './index';
import type { Lang } from './lang';

export interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: typeof t;
  tp: typeof tp;
}

export const I18nContext = createContext<I18n | null>(null);

/** Keeps <html lang>, the page title and the meta description in step with the language. */
export function applyDocumentLanguage(lang: Lang) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.title = t('app.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.description'));
}
