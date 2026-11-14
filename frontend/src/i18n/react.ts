import { useContext, useSyncExternalStore } from 'react';
import { getLang, setLang, subscribeLang } from './lang';
import { t, tp } from './index';
import { I18nContext, type I18n } from './context';

/** The language, `t`, `tp` and `setLang`; re-renders the component when the language changes. */
export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  const lang = useSyncExternalStore(subscribeLang, getLang, getLang);
  return ctx ? { ...ctx, lang } : { lang, setLang, t, tp };
}
