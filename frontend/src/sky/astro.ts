import type { KnownObject, SkyPatch, TargetId } from '../data/types';
import { num } from '../i18n/format';
import { KNOWN } from '../data/catalog';

const DEG = Math.PI / 180;
export const MJD_J2000 = 51544.5;

export const mjdToYear = (mjd: number) => 2000 + (mjd - MJD_J2000) / 365.25;

/** Move a catalogue position to another date using its proper motion. */
export function propagate(obj: KnownObject, year: number): { ra: number; dec: number } {
  const dt = year - obj.refYear;
  const dec = obj.dec + (obj.pmDec * dt) / 3.6e6;
  const ra = obj.ra + (obj.pmRa * dt) / 3.6e6 / Math.cos(obj.dec * DEG);
  return { ra: ((ra % 360) + 360) % 360, dec };
}

/** Tangent-plane approximation, fine for fields under a degree. North up, east left. */
export function skyToPixel(patch: SkyPatch, ra: number, dec: number) {
  const c = (patch.size - 1) / 2;
  let dra = ra - patch.center.ra;
  if (dra > 180) dra -= 360;
  if (dra < -180) dra += 360;
  return {
    x: c - (dra * Math.cos(patch.center.dec * DEG) * 3600) / patch.pixelScale,
    y: c - ((dec - patch.center.dec) * 3600) / patch.pixelScale,
  };
}

export function pixelToSky(patch: SkyPatch, x: number, y: number) {
  const c = (patch.size - 1) / 2;
  const dec = patch.center.dec - ((y - c) * patch.pixelScale) / 3600;
  const ra = patch.center.ra - ((x - c) * patch.pixelScale) / 3600 / Math.cos(patch.center.dec * DEG);
  return { ra: ((ra % 360) + 360) % 360, dec };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function formatRa(deg: number) {
  const h = deg / 15;
  const hh = Math.floor(h);
  const mFloat = (h - hh) * 60;
  const mm = Math.floor(mFloat);
  const ss = (mFloat - mm) * 60;
  return `${pad(hh)}h${pad(mm)}m${num(ss, 1).padStart(4, '0')}s`;
}

export function formatDec(deg: number) {
  const sign = deg < 0 ? '−' : '+';
  const a = Math.abs(deg);
  const dd = Math.floor(a);
  const mFloat = (a - dd) * 60;
  const mm = Math.floor(mFloat);
  const ss = Math.round((mFloat - mm) * 60);
  return `${sign}${pad(dd)}°${pad(mm)}′${pad(Math.min(ss, 59))}″`;
}

export const formatCoords = (ra: number, dec: number) => `${formatRa(ra)} ${formatDec(dec)}`;

const NAME_ALIASES: Record<string, TargetId> = {
  barnard: 'barnard', barnards: 'barnard', barnardsstar: 'barnard', barnardyldz: 'barnard',
  wise0855: 'wise0855', wise085507: 'wise0855', wise08550714: 'wise0855',
  epsilonindib: 'epsindb', epsindib: 'epsindb', epsindb: 'epsindb', epsilonindi: 'epsindb',
  rwaurigae: 'rwaur', rwaur: 'rwaur',
  rdraconis: 'rdra', rdra: 'rdra',
};

export function lookupName(text: string): TargetId | null {
  const key = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key) return null;
  if (NAME_ALIASES[key]) return NAME_ALIASES[key];
  const hit = Object.entries(NAME_ALIASES).find(([alias]) => alias.startsWith(key) && key.length >= 4);
  return hit ? hit[1] : null;
}

/**
 * Accepts "08h55m10.8s −07°14′42″", "08:55:10.8 -07:14:42", "133.795 -7.245".
 * Returns degrees or null.
 */
export function parseCoords(text: string): { ra: number; dec: number } | null {
  const norm = text
    .replace(/[−–—]/g, '-')
    .replace(/[hHmMsSdD°′″'":,]/g, ' ')
    .trim();
  const tokens = norm.split(/\s+/).filter(Boolean);
  if (tokens.some((t) => Number.isNaN(Number(t)))) return null;
  const nums = tokens.map(Number);
  if (tokens.length === 2) {
    const sexagesimalHint = /[hH:]/.test(text);
    const ra = sexagesimalHint ? nums[0] * 15 : nums[0];
    const dec = nums[1];
    return valid(ra, dec);
  }
  if (tokens.length === 6) {
    const ra = (nums[0] + nums[1] / 60 + nums[2] / 3600) * 15;
    const neg = tokens[3].startsWith('-');
    const dec = (Math.abs(nums[3]) + nums[4] / 60 + nums[5] / 3600) * (neg ? -1 : 1);
    return valid(ra, dec);
  }
  return null;
}

function valid(ra: number, dec: number) {
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
  if (ra < 0 || ra >= 360 || dec < -90 || dec > 90) return null;
  return { ra, dec };
}

export function knownObjectsList() {
  return Object.values(KNOWN);
}

/** RA with 0.01 s precision and Dec with 0.1 arcsec precision, for measured positions. */
export function formatRaFine(deg: number) {
  const h = deg / 15;
  const hh = Math.floor(h);
  const mFloat = (h - hh) * 60;
  const mm = Math.floor(mFloat);
  const ss = Math.min((mFloat - mm) * 60, 59.995);
  return `${pad(hh)}h${pad(mm)}m${num(ss, 2).padStart(5, '0')}s`;
}

export function formatDecFine(deg: number) {
  const sign = deg < 0 ? '−' : '+';
  const a = Math.abs(deg);
  const dd = Math.floor(a);
  const mFloat = (a - dd) * 60;
  const mm = Math.floor(mFloat);
  const ss = Math.min((mFloat - mm) * 60, 59.95);
  return `${sign}${pad(dd)}°${pad(mm)}′${num(ss, 1).padStart(4, '0')}″`;
}
