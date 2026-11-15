import { useRef, useState } from 'react';

/** What a search handler returns: nothing wrong (null), an error code, or either of them later (a name lookup). */
export type SearchResult = string | null | Promise<string | null>;

/**
 * Shared by the three search boxes. `busy` is the text being looked up while a name lookup runs; `error` is a code
 * (see searchErrorKey). A result from an older submit is ignored, so a slow lookup cannot overwrite a newer one.
 */
export function useSearchSubmit(onSearch: (text: string) => SearchResult) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  function submit(text: string) {
    const mine = ++seq.current;
    setError(null);
    const r = onSearch(text);
    if (typeof r === 'string' || r === null) {
      setBusy(null);
      setError(r);
      return;
    }
    setBusy(text.trim());
    r.then((code) => {
      if (mine !== seq.current) return;
      setBusy(null);
      setError(code === 'aborted' ? null : code);
    });
  }
  function clear() {
    seq.current++;
    setBusy(null);
    setError(null);
  }
  return { busy, error, submit, clear };
}

/** Translation key for an error code from the search handler. */
export const searchErrorKey = (code: string) =>
  (code === 'badQuery' || code === 'notFound' || code === 'unreachable' || code === 'service' ? `resolve.err.${code}` : 'search.error') as
    'resolve.err.badQuery' | 'resolve.err.notFound' | 'resolve.err.unreachable' | 'resolve.err.service' | 'search.error';
