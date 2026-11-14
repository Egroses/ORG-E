import type { Chip, Outcome, Pt, TargetId } from '../data/types';

export interface Observation {
  ra: number;
  dec: number;
  epoch: string;
  band: string;
  chips: Chip[];
  savedAt: string;
}

export interface Progress {
  results: Partial<Record<TargetId, Outcome>>;
  observations: Observation[];
}

const KEY = 'skyquest.v1';

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Progress;
      return { results: p.results ?? {}, observations: p.observations ?? [] };
    }
  } catch {
    // storage unavailable (private mode, blocked): start fresh
  }
  return { results: {}, observations: [] };
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // ignore: progress simply won't persist
  }
}

/** The last checked case, kept per tab so a refresh on the result page still shows it. */
export interface RevealState {
  caseId: TargetId;
  mark: Pt | null;
  chips: Chip[];
  gaveUp: boolean;
  peeked: boolean;
}

const REVEAL_KEY = 'skyquest.reveal';

export function loadReveal(): RevealState | null {
  try {
    const raw = sessionStorage.getItem(REVEAL_KEY);
    return raw ? (JSON.parse(raw) as RevealState) : null;
  } catch {
    return null;
  }
}

export function clearReveal() {
  try {
    sessionStorage.removeItem(REVEAL_KEY);
  } catch {
    // nothing stored
  }
}

export function storeReveal(r: RevealState) {
  try {
    sessionStorage.setItem(REVEAL_KEY, JSON.stringify(r));
  } catch {
    // ignore: a refresh will fall back to the case itself
  }
}
