import type { Epoch } from './types';
import { dateWindow, visitLabels } from '../i18n/format';

export interface EpochTimes {
  mjdStart: number;
  mjdEnd: number;
  mjd: number;
  imageCount: number;
}

/**
 * Builds the visits of a patch from their dates alone. The label ("Aug 2025") and the window ("15 Aug – 1 Oct 2025") are
 * not stored: they are read from the numbers in the language that is current at that moment, so the server's English
 * strings are never shown and a language switch needs no new data.
 */
export function makeEpochs(raw: EpochTimes[]): Epoch[] {
  const means = raw.map((r) => r.mjd);
  return raw.map((r, index) => Object.defineProperties({ index, ...r } as Epoch, {
    label: { enumerable: true, get: () => visitLabels(means)[index] },
    dates: { enumerable: true, get: () => dateWindow(r.mjdStart, r.mjdEnd) },
  }));
}
