import { useEffect, useMemo, useState } from 'react';
import type { LiveProgress, SkyPatch } from '../data/types';
import { SkyCanvas } from '../components/SkyCanvas';
import { Icon } from '../components/Icon';
import { LiveWait } from '../components/LiveWait';
import { percentileStretch, refNoise } from '../sky/render';
import type { RealisticState } from '../state/viewState';
import { R } from '../ui/realisticText';
import { num } from '../i18n';
import { useI18n } from '../i18n/react';
import './embed.css';

/** Loading or error text inside the embedded page (no header, no forms). */
export function EmbedStatus({ live, error }: { live?: LiveProgress | null; error?: string | null }) {
  const { t } = useI18n();
  return (
    <main className="embed embed-status">
      {error ? <p className="form-error" role="alert">{error}</p> : (
        <>
          <p className="t-body" role="status">{t('embed.loading')}</p>
          {live && <LiveWait live={live} />}
        </>
      )}
    </main>
  );
}

interface Props {
  patch: SkyPatch;
  initial: RealisticState;
  onState: (s: RealisticState) => void;
}

/**
 * The page that goes into an iframe: the sky picture, the visit and band buttons and a play button. Position,
 * band, visit, speed, mode and the other display settings come from the address; nothing else is drawn.
 */
export function EmbedView({ patch, initial, onState }: Props) {
  const { t } = useI18n();
  const nEp = patch.epochs.length;
  const nBands = patch.bands.length;
  const clampEp = (e: number | undefined, fallback: number) => (e !== undefined && e >= 0 && e < nEp ? e : fallback);
  const startBand = (() => {
    const i = initial.band ? patch.bands.findIndex((b) => b.id === initial.band) : -1;
    return i >= 0 ? i : nBands - 1;
  })();
  const firstWithPhoto = (b: number) => {
    const i = patch.epochs.findIndex((_, e) => !patch.missing?.[e]?.[b]);
    return i < 0 ? 0 : i;
  };
  const [epoch, setEpoch] = useState(() => clampEp(initial.visit, 0));
  const [band, setBand] = useState(startBand);
  const [playing, setPlaying] = useState(false);
  const compare = initial.mode;
  const fixedRef = clampEp(initial.ref, firstWithPhoto(startBand));
  const useSet = initial.use?.filter((e) => e < nEp) ?? [];
  const speed = initial.speed ?? 1;

  // Keep the address in step with what is shown, so "copy the address" from the frame reopens the same picture.
  useEffect(() => {
    onState({ ...initial, band: patch.bands[band].id, visit: epoch, ref: compare === 'diff' ? fixedRef : undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band, epoch]);

  const cycling = playing && compare !== 'stack' && nEp > 1;
  useEffect(() => {
    if (!cycling) return;
    const id = window.setInterval(() => setEpoch((e) => {
      if (compare !== 'blink' || !useSet.length) return (e + 1) % nEp;
      for (let k = 1; k <= nEp; k++) { const n = (e + k) % nEp; if (useSet.includes(n)) return n; }
      return e;
    }), 1000 / speed);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycling, speed, nEp, compare]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === ' ' && (e.target as HTMLElement | null)?.tagName !== 'BUTTON') { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === 'ArrowRight') { setPlaying(false); setEpoch((v) => (v + 1) % nEp); }
      else if (e.key === 'ArrowLeft') { setPlaying(false); setEpoch((v) => (v - 1 + nEp) % nEp); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nEp]);

  const bandFrames = useMemo(() => patch.frames.map((f) => f[band]), [patch, band]);
  const bandMasks = useMemo(() => patch.nodata?.map((n) => n[band]) ?? [], [patch, band]);
  const noiseRef = useMemo(() => refNoise(patch.noise, band), [patch, band]);
  const stretch = useMemo(
    () => percentileStretch(bandFrames, bandMasks, initial.lo, initial.hi, initial.stretch, noiseRef),
    [bandFrames, bandMasks, initial.lo, initial.hi, initial.stretch, noiseRef],
  );
  const refEpoch = initial.refPrev ? (epoch > 0 ? epoch - 1 : Math.min(1, nEp - 1)) : fixedRef;
  const stackUsed = patch.epochs.map((_, e) => e).filter((e) => !patch.missing?.[e]?.[band]);
  const bandObj = patch.bands[band];
  const ep = patch.epochs[epoch];
  const missingHere = !!patch.missing?.[epoch]?.[band];
  const hasShare = !!patch.flagShare;

  return (
    <main className="embed" aria-label={t('embed.label')}>
      <div className="embed-sky">
        <SkyCanvas
          className="embed-canvas"
          patch={patch}
          epoch={epoch}
          band={band}
          mode={compare}
          invert={initial.invert}
          grid={initial.grid}
          smooth={initial.smooth}
          stretchOverride={stretch}
          quality={hasShare ? initial.quality : 'none'}
          physical={!!patch.noiseRefMJySr}
          refEpoch={refEpoch}
          stackEpochs={stackUsed}
        >
          <div className="sky-lab">
            <b>{compare === 'stack' ? R.stackLabel : ep.label}</b>
            <span>{compare === 'stack' ? '' : ep.dates}</span>
          </div>
          <span className="sky-band" style={{ borderColor: bandObj.color }}>
            <i style={{ background: bandObj.color }} />{bandObj.id} · {num(bandObj.rangeUm[0], 2)}–{num(bandObj.rangeUm[1], 2)} µm
          </span>
          {missingHere && compare === 'blink' && <span className="sky-chip sky-chip-nodata">{R.noPhotoChip}</span>}
        </SkyCanvas>
      </div>
      <div className="embed-bar">
        <button type="button" className="playbtn" onClick={() => setPlaying((p) => !p)} disabled={compare === 'stack' || nEp < 2} aria-label={cycling ? R.pause : R.play}>
          <Icon name={cycling ? 'pause' : 'play'} size={16} />
        </button>
        <div className="seg" role="group" aria-label={R.stepEpochs}>
          {patch.epochs.map((e, i) => (
            <button key={e.index} type="button" aria-pressed={i === epoch} title={`${e.label}: ${e.dates}`} onClick={() => { setEpoch(i); setPlaying(false); }}>
              {e.label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label={R.stepBands}>
          {patch.bands.map((b, i) => (
            <button key={b.id} type="button" aria-pressed={i === band} title={`${num(b.rangeUm[0], 2)}–${num(b.rangeUm[1], 2)} µm`} onClick={() => setBand(i)}>
              {b.id}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
