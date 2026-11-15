import { useEffect, useId, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

const KEY = 'sq.closed.';
/** Window event: every section opens (detail true) or closes (detail false). */
export const COLLAPSE_ALL_EVENT = 'sq:collapse-all';

function readClosed(id: string): boolean | null {
  try {
    const v = window.localStorage.getItem(KEY + id);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
}

function writeClosed(id: string, closed: boolean) {
  try {
    window.localStorage.setItem(KEY + id, closed ? '1' : '0');
  } catch {
    // storage blocked: the section still works, it just forgets
  }
}

/** A panel section whose body the visitor can fold away. The choice is remembered per section id. */
export function Collapsible({ id, title, children, defaultOpen = true }: { id: string; title: string; children: ReactNode; defaultOpen?: boolean }) {
  const uid = useId();
  const [open, setOpen] = useState(() => {
    const closed = readClosed(id);
    return closed === null ? defaultOpen : !closed;
  });

  useEffect(() => {
    const onAll = (e: Event) => {
      const next = (e as CustomEvent<boolean>).detail;
      setOpen(next);
      writeClosed(id, !next);
    };
    window.addEventListener(COLLAPSE_ALL_EVENT, onAll);
    return () => window.removeEventListener(COLLAPSE_ALL_EVENT, onAll);
  }, [id]);

  function toggle() {
    setOpen((o) => {
      writeClosed(id, o);
      return !o;
    });
  }

  return (
    <section className="block collapsible" data-open={open} aria-labelledby={`${uid}-h`}>
      <h2 className="t-label" id={`${uid}-h`}>
        <button type="button" className="collapse-btn" aria-expanded={open} aria-controls={`${uid}-b`} onClick={toggle}>
          <span>{title}</span>
          <span className="collapse-chev" aria-hidden="true"><Icon name="chevron" size={16} /></span>
        </button>
      </h2>
      <div className="collapsible-body" id={`${uid}-b`} hidden={!open}>{children}</div>
    </section>
  );
}

/** Two small buttons that open or close every section at once. */
export function CollapseAll({ openLabel, closeLabel }: { openLabel: string; closeLabel: string }) {
  const send = (open: boolean) => window.dispatchEvent(new CustomEvent<boolean>(COLLAPSE_ALL_EVENT, { detail: open }));
  return (
    <div className="collapse-all">
      <button type="button" className="btn-link" onClick={() => send(true)}>{openLabel}</button>
      <span aria-hidden="true">·</span>
      <button type="button" className="btn-link" onClick={() => send(false)}>{closeLabel}</button>
    </div>
  );
}
