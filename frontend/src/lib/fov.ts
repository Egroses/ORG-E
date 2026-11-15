// Field size helpers. The data service accepts 0.05 to 0.25 degrees (3 to 15 arcminutes); the saved
// (pre-built) cutouts are 0.1 degrees (6 arcminutes) wide.

export const FOV_MIN_ARCMIN = 3;
export const FOV_MAX_ARCMIN = 15;
/** Side of the saved cutouts, in degrees. A larger field of a saved target has empty edges. */
export const SAVED_FOV_DEG = 0.1;

export type FovCheck =
  | { ok: true; arcmin: number; deg: number; clamped: boolean }
  | { ok: false };

/** Degrees as the data service wants them: four decimals are plenty (0.0001 degree = 0.4 arcsecond). */
export const arcminToDeg = (a: number) => Math.round((a / 60) * 10000) / 10000;

/** Text typed by the visitor (a comma as decimal mark is accepted) to a field size, clamped to 3-15 arcminutes. */
export function checkFovArcmin(text: string): FovCheck {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return { ok: false };
  const v = Number(trimmed);
  if (!Number.isFinite(v)) return { ok: false };
  const arcmin = Math.min(FOV_MAX_ARCMIN, Math.max(FOV_MIN_ARCMIN, v));
  return { ok: true, arcmin, deg: arcminToDeg(arcmin), clamped: arcmin !== v };
}

/** A field in the address: any value the service accepts is kept (rounded), anything else becomes the default 0.1. */
export function parseFovDeg(raw: string | null, fallback = 0.1): number {
  if (raw === null || raw.trim() === '') return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v)) return fallback;
  const lo = FOV_MIN_ARCMIN / 60;
  const hi = FOV_MAX_ARCMIN / 60;
  return Math.round(Math.min(hi, Math.max(lo, v)) * 10000) / 10000;
}

/** True when the field is wider than the saved cutouts. */
export const exceedsSaved = (fovDeg: number) => fovDeg > SAVED_FOV_DEG + 1e-6;
