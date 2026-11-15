import { useEffect, useRef } from 'react';
import { isMockForced } from '../data/provider';
import { useI18n } from '../i18n/react';

/** Full-width warning shown on every screen while the developer switch ?data=mock is on (demo data, not real images). */
export function DemoBanner() {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const on = isMockForced();
  useEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    const set = () => document.documentElement.style.setProperty('--demo-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => { ro.disconnect(); document.documentElement.style.removeProperty('--demo-h'); };
  }, [on]);
  if (!on) return null;
  return <div ref={ref} className="demo-banner" role="alert">{t('demo.banner')}</div>;
}
