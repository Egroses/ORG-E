import type { LiveProgress } from '../data/types';

/** 75 -> "1:15", 3725 -> "1:02:05". */
export function elapsedText(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Share of the images that are done, 0-100, or null while the total is not known yet. */
export function percentDone(p: Pick<LiveProgress, 'total' | 'done'>): number | null {
  if (!(p.total > 0)) return null;
  return Math.min(100, Math.max(0, Math.round((p.done / p.total) * 100)));
}
