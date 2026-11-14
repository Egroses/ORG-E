import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { getLang, setLang, subscribeLang } from './lang';
import { t, tp } from './index';
import { I18nContext, applyDocumentLanguage } from './context';

export function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribeLang, getLang, getLang);
  useEffect(() => applyDocumentLanguage(lang), [lang]);
  return <I18nContext.Provider value={{ lang, setLang, t, tp }}>{children}</I18nContext.Provider>;
}
