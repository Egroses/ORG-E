import { describe, expect, it, vi } from 'vitest';
import { createRealProvider, liveProgressOf, LIVE_TIMEOUT_MS, isAbort } from './realProvider';
import { elapsedText, percentDone } from '../lib/liveFormat';

const resp = (status: number, body: unknown) => ({ status, ok: status < 400, json: async () => body }) as unknown as Response;

describe('live query waiting', () => {
  it('waits 25 minutes for a position that is not saved', () => {
    expect(LIVE_TIMEOUT_MS).toBe(25 * 60_000);
  });

  it('reports progress on every 202 answer, with optional detector fields', async () => {
    const seen: ReturnType<typeof liveProgressOf>[] = [];
    const answers = [
      resp(202, { status: 'queued', id: 'x' }),
      resp(202, { status: 'running', progress: { total: 58, done: 10, failed: 1 } }),
      resp(202, { status: 'running', progress: { total: 58, done: 30, failed: 1, detector_done: 1, detector_total: 3 } }),
    ];
    let n = 0;
    const fetchImpl = vi.fn(async () => (n < answers.length ? answers[n++] : resp(200, { status: 'failed', error: { code: 'no_coverage', message: 'm' } })));
    await expect(createRealProvider({ base: '', fetchImpl: fetchImpl as unknown as typeof fetch, pollMs: 1 })
      .getPatch({ ra: 1, dec: 1, fovDeg: 0.1 }, undefined, { onProgress: (p) => seen.push(p) })).rejects.toMatchObject({ kind: 'server', code: 'no_coverage' });
    expect(seen.map((p) => [p.total, p.done, p.failed])).toEqual([[0, 0, 0], [58, 10, 1], [58, 30, 1]]);
    expect(seen[1].detectorDone).toBeUndefined();
    expect(seen[2]).toMatchObject({ detectorDone: 1, detectorTotal: 3 });
  });

  it('keeps polling a non-saved position past the short timeout', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => (++n < 8 ? resp(202, { status: 'running' }) : resp(200, { status: 'failed', error: { code: 'internal_error', message: 'm' } })));
    await expect(createRealProvider({ base: '', fetchImpl: fetchImpl as unknown as typeof fetch, pollMs: 5, timeoutMs: 10 })
      .getPatch({ ra: 1, dec: 1, fovDeg: 0.1 })).rejects.toMatchObject({ kind: 'server' });
    expect(fetchImpl.mock.calls.length).toBe(8);
  });

  it('stops polling when the signal is aborted', async () => {
    const ctl = new AbortController();
    const fetchImpl = vi.fn(async (_u: unknown, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return resp(202, { status: 'running' });
    });
    const p = createRealProvider({ base: '', fetchImpl: fetchImpl as unknown as typeof fetch, pollMs: 50 })
      .getPatch({ ra: 1, dec: 1, fovDeg: 0.1 }, undefined, { signal: ctl.signal });
    await new Promise((r) => setTimeout(r, 20));
    ctl.abort();
    const err = await p.catch((e) => e);
    expect(isAbort(err)).toBe(true);
    const calls = fetchImpl.mock.calls.length;
    await new Promise((r) => setTimeout(r, 150));
    expect(fetchImpl.mock.calls.length).toBe(calls);
  });

  it('turns odd numbers into zero and ignores half-given detector fields', () => {
    expect(liveProgressOf({ status: 'running', progress: { total: -1, done: NaN as unknown as number, failed: 0, detector_done: 2 } }, 5))
      .toEqual({ total: 0, done: 0, failed: 0, startedAt: 5 });
  });

  it('formats elapsed time and the bar', () => {
    expect(elapsedText(75)).toBe('1:15');
    expect(elapsedText(3725)).toBe('1:02:05');
    expect(percentDone({ total: 0, done: 0 })).toBeNull();
    expect(percentDone({ total: 58, done: 29 })).toBe(50);
    expect(percentDone({ total: 10, done: 12 })).toBe(100);
  });
});
