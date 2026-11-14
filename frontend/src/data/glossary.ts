import { t, type Key } from '../i18n';

export interface GlossaryEntry {
  /** Stable id, also the `k` of <Term k="...">. Never translated. */
  id: string;
  /** The word in the current language. */
  readonly term: string;
  /** Its plain-language meaning in the current language. */
  readonly plain: string;
}

const IDS = [
  'Infrared', 'Band', 'Wavelength', 'Visit', 'Stack', 'Proper motion', 'Arcsecond', 'Pixel', 'Catalogue', 'Gaia',
  'Brown dwarf', 'Saturated', 'Noise', 'Candidate', 'RA', 'Dec', 'Flag', 'Lower limit',
] as const;

const entry = (id: string): GlossaryEntry => ({
  id,
  get term() { return t(`gl.${id}.term` as Key); },
  get plain() { return t(`gl.${id}.plain` as Key); },
});

/** Plain-language meanings. Anything technical in the interface links back to one of these. */
export const GLOSSARY: GlossaryEntry[] = IDS.map(entry);

export const termPlain = (id: string) => GLOSSARY.find((g) => g.id.toLowerCase() === id.toLowerCase())?.plain ?? '';
