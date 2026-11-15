import type { Band, BandId, Epoch, LiveProgress, LoadStep, PatchRequest, SkyDataProvider, SkyPatch } from './types';
import { ALL_BANDS } from './catalog';
import { decodeFloat32, decodeUint8 } from './decode';
import { makeEpochs } from './epochs';
import { DataError } from './errors';

// Talks to GET /api/patch (contract: docs/patch-api.md) and converts the answer to a SkyPatch.

/** `noise` is null when the backend could not measure it (no empty-sky pixels); never NaN, see docs/patch-api.md. */
export interface PayloadFrame { data: string; noise: number | null; flag_share: string; n_images: number }
export interface PatchPayload {
  status: 'done' | 'queued' | 'running' | 'failed';
  id?: string;
  source?: string;
  center?: { ra: number; dec: number };
  fov_deg?: number;
  size?: number;
  pixel_scale_arcsec?: number;
  epochs?: {
    index: number; mjd_start: number; mjd_end: number; mjd_mean: number; label: string; dates: string;
    n_images: Record<string, number>;
  }[];
  bands?: { detector: number; wavelength_um: [number, number] }[];
  frames?: (PayloadFrame | null)[][];
  progress?: { total: number; done: number; failed: number; detector_done?: number; detector_total?: number };
  /** Optional, may appear at the top level once the backend reports them. */
  detector_done?: number;
  detector_total?: number;
  error?: { code: string; message: string };
  warnings?: string[];
  data_release?: { collections?: Record<string, number>; latest_mjd?: number | null };
}

/** A pixel counts as unreliable when it is flagged in at least 20% of the stacked exposures (51 of 255). */
export const FLAG_SHARE_THRESHOLD = 51;

/** Detector number (1-6) to band id. Detectors 1, 3 and 5 are only requested by Realistic mode. */
export const DETECTOR_BAND: Record<number, BandId> = { 1: 'D1', 2: 'D2', 3: 'D3', 4: 'D4', 5: 'D5', 6: 'D6' };

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  if (s.length === 0) return 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Converts the wire format to the units the game uses.
 * - frame value = MJy/sr divided by noise_ref, noise_ref = median of all frames' noise, so noise is about 1;
 * - NaN (masked) pixels become 0 and are flagged;
 * - flags = 1 where flag_share >= 51;
 * - a detector with no exposure in an epoch (null frame) becomes an all-zero, all-flagged frame with the
 *   reference noise, and is marked in `missing` so the UI can say "no photo for this band on this date".
 */
export function convertPatch(p: PatchPayload): SkyPatch {
  if (!p.size || !p.epochs || !p.bands || !p.frames || !p.center) throw new DataError('incomplete');
  const size = p.size;
  const keep = p.bands
    .map((b, i) => ({ i, id: DETECTOR_BAND[b.detector] }))
    .filter((x): x is { i: number; id: BandId } => !!x.id);
  if (!keep.length) throw new DataError('noBands');
  const bands: Band[] = keep.map((k) => ALL_BANDS.find((b) => b.id === k.id)!);

  const noises: number[] = [];
  for (const row of p.frames) for (const f of row) if (f && f.noise != null && f.noise > 0 && Number.isFinite(f.noise)) noises.push(f.noise);
  const noiseRef = median(noises);

  // Labels and windows come from the MJD numbers, never from the server's English `label` / `dates`.
  const epochs: Epoch[] = makeEpochs(p.epochs.map((e) => ({
    mjdStart: e.mjd_start,
    mjdEnd: e.mjd_end,
    mjd: e.mjd_mean,
    imageCount: Object.values(e.n_images ?? {}).reduce((s, n) => s + n, 0),
  })));

  const frames: Float32Array[][] = [];
  const flags: Uint8Array[][] = [];
  const noise: number[][] = [];
  const missing: boolean[][] = [];
  const nodataAll: Uint8Array[][] = [];
  const shareAll: Uint8Array[][] = [];
  const counts: number[][] = [];
  p.frames.forEach((row) => {
    const fr: Float32Array[] = [];
    const fl: Uint8Array[] = [];
    const nz: number[] = [];
    const ms: boolean[] = [];
    const nd: Uint8Array[] = [];
    const sh: Uint8Array[] = [];
    const ct: number[] = [];
    for (const k of keep) {
      const f = row[k.i];
      if (!f) {
        fr.push(new Float32Array(size * size));
        fl.push(new Uint8Array(size * size).fill(1));
        nz.push(1);
        ms.push(true);
        nd.push(new Uint8Array(size * size).fill(1));
        sh.push(new Uint8Array(size * size));
        ct.push(0);
        continue;
      }
      const data = decodeFloat32(f.data, size * size);
      const share = decodeUint8(f.flag_share, size * size);
      const out = new Float32Array(size * size);
      const flg = new Uint8Array(size * size);
      const nod = new Uint8Array(size * size);
      for (let i = 0; i < out.length; i++) {
        const v = data[i];
        if (Number.isNaN(v)) {
          out[i] = 0;
          flg[i] = 1;
          nod[i] = 1;
        } else {
          out[i] = v / noiseRef;
          flg[i] = share[i] >= FLAG_SHARE_THRESHOLD ? 1 : 0;
        }
      }
      fr.push(out);
      fl.push(flg);
      // An unmeasurable noise (null) counts as the reference noise: dividing null would give 0 and later a division by zero.
      nz.push(f.noise != null && f.noise > 0 && Number.isFinite(f.noise) ? f.noise / noiseRef : 1);
      ms.push(false);
      nd.push(nod);
      sh.push(share);
      ct.push(f.n_images);
    }
    frames.push(fr);
    flags.push(fl);
    noise.push(nz);
    missing.push(ms);
    nodataAll.push(nd);
    shareAll.push(sh);
    counts.push(ct);
  });

  return {
    center: p.center,
    fovDeg: p.fov_deg ?? 0.1,
    size,
    pixelScale: p.pixel_scale_arcsec ?? 6.15,
    epochs, bands, frames, flags, noise,
    missing, imageCounts: counts,
    nodata: nodataAll,
    flagShare: shareAll,
    noiseRefMJySr: noiseRef,
    dataRelease: p.data_release?.collections
      ? { collections: p.data_release.collections, latestMjd: p.data_release.latest_mjd ?? null }
      : undefined,
    warnings: p.warnings,
    source: 'irsa',
  };
}

/** Wait that ends at once (with an AbortError) when the signal fires. */
const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
  const id = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
  const onAbort = () => { clearTimeout(id); reject(new DOMException('Aborted', 'AbortError')); };
  signal?.addEventListener('abort', onAbort, { once: true });
});

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** Plain numbers from a 202 answer. Missing or odd values become 0 / undefined, never NaN. */
export function liveProgressOf(p: PatchPayload, startedAt: number): LiveProgress {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  const pr = p.progress;
  const dd = n(pr?.detector_done ?? p.detector_done);
  const dt = n(pr?.detector_total ?? p.detector_total);
  return {
    total: n(pr?.total) ?? 0,
    done: n(pr?.done) ?? 0,
    failed: n(pr?.failed) ?? 0,
    ...(dd !== undefined && dt !== undefined && dt > 0 ? { detectorDone: dd, detectorTotal: dt } : {}),
    startedAt,
  };
}

export interface RealProviderOptions {
  base?: string;
  fetchImpl?: typeof fetch;
  pollMs?: number;
  /** Give up after this long (ms) for a saved position (the answer should be instant). */
  timeoutMs?: number;
  /** Give up after this long (ms) for a position that is downloaded live. */
  liveTimeoutMs?: number;
}

/** A live download takes about 15 minutes for detectors 2, 4 and 6; 25 minutes leaves room for all six. */
export const LIVE_TIMEOUT_MS = 25 * 60_000;

export const API_BASE: string = (import.meta.env?.VITE_API_BASE as string | undefined) ?? '';

export function stepFor(p: PatchPayload): LoadStep {
  if (p.status === 'queued') return 'finding';
  const pr = p.progress;
  if (!pr || pr.total <= 0) return 'downloading';
  return pr.done / pr.total >= 0.85 ? 'stacking' : 'downloading';
}

export function createRealProvider(opts: RealProviderOptions = {}): SkyDataProvider {
  const base = opts.base ?? API_BASE;
  const doFetch: typeof fetch = opts.fetchImpl ?? ((...a) => fetch(...a));
  const pollMs = opts.pollMs ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const liveTimeoutMs = opts.liveTimeoutMs ?? LIVE_TIMEOUT_MS;
  return {
    async getPatch(req: PatchRequest, onStep, lo) {
      const signal = lo?.signal;
      const epochParams =
        (req.gapDays != null ? `&gap_days=${req.gapDays}` : '') +
        (req.maxSpanDays != null ? `&max_span_days=${req.maxSpanDays}` : '');
      const url = `${base}/api/patch?ra=${req.ra}&dec=${req.dec}&fov=${req.fovDeg}&dets=${(req.dets ?? [2, 4, 6]).join(',')}${epochParams}`;
      const started = Date.now();
      onStep?.('finding');
      for (;;) {
        let res: Response;
        try {
          res = await doFetch(url, signal ? { signal } : undefined);
        } catch (e) {
          if (isAbort(e) || signal?.aborted) throw new DOMException('Aborted', 'AbortError');
          throw new DataError('unreachable');
        }
        if (res.status === 202 || res.status === 200) {
          const body = (await res.json()) as PatchPayload;
          if (body.status === 'failed') {
            throw new DataError('server', { code: body.error?.code, serverMessage: body.error?.message });
          }
          if (body.status === 'done') {
            const patch = convertPatch(body);
            if (req.gapDays != null && req.maxSpanDays != null) patch.grouping = { gapDays: req.gapDays, maxSpanDays: req.maxSpanDays };
            onStep?.('done');
            return patch;
          }
          onStep?.(stepFor(body));
          lo?.onProgress?.(liveProgressOf(body, started));
        } else {
          let err: { code?: string; message?: string } | undefined;
          try {
            err = ((await res.json()) as { error?: { code?: string; message?: string } }).error;
          } catch {
            // not JSON: the generic message is used
          }
          throw new DataError('server', { code: err?.code, serverMessage: err?.message });
        }
        if (Date.now() - started > (req.cached ? timeoutMs : liveTimeoutMs)) {
          throw new DataError('timeout');
        }
        await wait(pollMs, signal);
      }
    },
  };
}

export async function apiIsUp(base = API_BASE, fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetchImpl(`${base}/api/health`, { signal: ctl.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}
