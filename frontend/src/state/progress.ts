import type { Chip, Outcome, Pt, TargetId } from '../data/types';
import { verdictText, type SourceRef, type VerdictKind } from '../sky/catalogue';
import { legacyVerdictText } from './legacyVerdict';

export interface Observation {
  ra: number;
  dec: number;
  epoch: string;
  band: string;
  chips: Chip[];
  savedAt: string;
}

/** A spot the player marked that no catalogue explains: kept in this browser as a "candidate", never as a discovery. */
export interface Candidate {
  id: string;
  ra: number;
  dec: number;
  /** Measured shift between the first and last photo, arcseconds (null if it could not be measured). */
  shiftArcsec: number | null;
  rateArcsecPerYear: number | null;
  /** Catalogue verdict at the time of saving, as data (so it can be worded in any language) ... */
  verdictKind?: VerdictKind;
  verdictSource?: SourceRef | null;
  verdictMoves?: 'rate' | 'still' | null;
  verdictRate?: number | null;
  /** ... and, for candidates saved by older versions, the English sentence. */
  verdict: string;
  band: string;
  note: string;
  savedAt: string;
}

export interface Progress {
  results: Partial<Record<TargetId, Outcome>>;
  observations: Observation[];
  candidates: Candidate[];
}

const KEY = 'skyquest.v1';

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Progress;
      return { results: p.results ?? {}, observations: p.observations ?? [], candidates: p.candidates ?? [] };
    }
  } catch {
    // storage unavailable (private mode, blocked): start fresh
  }
  return { results: {}, observations: [], candidates: [] };
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

const csvCell = (v: string | number | null) => {
  const t = v === null ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** The catalogue verdict of a saved candidate, worded in the language on screen. */
export function candidateVerdict(c: Candidate): string {
  if (!c.verdictKind) return legacyVerdictText(c.verdict);
  return verdictText({ kind: c.verdictKind, source: c.verdictSource ?? null, catRate: c.verdictRate ?? null, moves: c.verdictMoves ?? null });
}

/** Language-independent verdict for the CSV: "match: Barnard's Star", "none", or the old English sentence. */
export function csvVerdict(c: Candidate): string {
  if (!c.verdictKind) return c.verdict;
  return c.verdictSource ? `${c.verdictKind}: ${c.verdictSource.name}` : c.verdictKind;
}

/** Candidates as CSV text (opens in any spreadsheet). Column names stay in English so scientists can share the file. */
export function candidatesToCsv(list: Candidate[]): string {
  const head = ['id', 'ra_deg', 'dec_deg', 'shift_arcsec', 'rate_arcsec_per_year', 'catalogue_verdict', 'band', 'note', 'saved_at'];
  const rows = list.map((c) => [c.id, c.ra.toFixed(6), c.dec.toFixed(6), c.shiftArcsec?.toFixed(2) ?? null,
    c.rateArcsecPerYear?.toFixed(2) ?? null, csvVerdict(c), c.band, c.note, c.savedAt].map(csvCell).join(','));
  return [head.join(','), ...rows].join('\n') + '\n';
}
