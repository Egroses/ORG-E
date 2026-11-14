import { useEffect, useMemo, useRef } from 'react';
import type { Pt } from '../data/types';
import { cropFrame, paintImage, type Stretch } from '../sky/render';

interface Props {
  data: Float32Array;
  /** Pixels without data (masked), painted as hatched grey. */
  nodata?: Uint8Array;
  size: number;
  center: Pt;
  half: number;
  stretch: Stretch;
  tint: [number, number, number];
  truth: Pt;
  mark?: Pt | null;
}

/** A close-up of the answer region for one epoch, at real pixel resolution. */
export function CropView({ data, nodata, size, center, half, stretch, tint, truth, mark }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const crop = useMemo(() => cropFrame(data, size, center.x, center.y, half), [data, size, center.x, center.y, half]);

  const cropMask = useMemo(() => {
    if (!nodata) return undefined;
    const c = cropFrame(Float32Array.from(nodata), size, center.x, center.y, half);
    return Uint8Array.from(c.data, (v) => (v > 0 ? 1 : 0));
  }, [nodata, size, center.x, center.y, half]);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(crop.size, crop.size);
    paintImage(img, crop.data, stretch, tint, false, cropMask);
    ctx.putImageData(img, 0, 0);
  }, [crop.data, crop.size, stretch, tint, cropMask]);

  const w = crop.size;
  const ring = (p: Pt, r: number) => ({
    left: `${((p.x - crop.x0 + 0.5 - r) / w) * 100}%`,
    top: `${((p.y - crop.y0 + 0.5 - r) / w) * 100}%`,
    width: `${((2 * r) / w) * 100}%`,
  });
  const markInside = mark && mark.x >= crop.x0 - 1 && mark.x <= crop.x0 + w && mark.y >= crop.y0 - 1 && mark.y <= crop.y0 + w;

  return (
    <div className="crop">
      <canvas ref={ref} width={w} height={w} className="sky-canvas" />
      <span className="crop-ring" style={ring(truth, 1.6)} />
      {markInside && mark && <span className="crop-mark" style={ring(mark, 1.6)} />}
    </div>
  );
}
