"""Backward-compatible `make_frames` (same signature and outputs as backend/app/frames.py).

Writes n.png, stacks.npz and frames.json, built on imaging.core (TanWCS, bilinear resampling,
clipped-mean stacking, epochs with a span cap). write_png / write_diff_png keep the backend's
behaviour. Three optional trailing keyword arguments are new; the first eight are unchanged.
AI-assisted code (Claude Code).
"""

import json
from datetime import date, timedelta
from pathlib import Path

import numpy as np
from astropy.stats import sigma_clipped_stats
from PIL import Image

from . import core
from .core import SCALE_ARCSEC

GAP_DAYS = core.GAP_DAYS


def mjd_to_date(mjd):
    return (date(1858, 11, 17) + timedelta(days=float(mjd))).isoformat()


def display_range(stacks, mode):
    values = np.concatenate([s[np.isfinite(s)] for s in stacks]) if stacks else np.array([])
    if values.size < 10:
        return {"min": 0.0, "max": 1.0, "stretch": "asinh"}
    _, median, sigma = sigma_clipped_stats(values, sigma=3.0)
    vmin = median - 2 * sigma
    vmax = median + 40 * sigma if mode == "shift_add" else float(np.percentile(values, 99.9))
    if vmax <= vmin:
        vmax = vmin + 1.0
    return {"min": round(float(vmin), 4), "max": round(float(vmax), 4), "stretch": "asinh"}


def write_png(data, rng, path, a=0.1):
    x = np.clip((data - rng["min"]) / (rng["max"] - rng["min"]), 0, 1)
    x = np.nan_to_num(x, nan=0.0)
    img = (255 * np.arcsinh(x / a) / np.arcsinh(1 / a)).astype(np.uint8)
    Image.fromarray(np.flipud(img), mode="L").save(path)  # FITS row 0 is the bottom


def write_diff_png(stacks_path, a, b, path):
    """Later minus earlier, zero-centred, linear, limits +-5 sigma."""
    with np.load(stacks_path) as data:
        diff = data["stacks"][b] - data["stacks"][a]
    finite = diff[np.isfinite(diff)]
    sigma = sigma_clipped_stats(finite, sigma=3.0)[2] if finite.size > 10 else 1.0
    sigma = sigma if sigma > 0 else 1.0
    gray = np.nan_to_num(np.clip(0.5 + diff / (10 * sigma), 0, 1), nan=0.5)
    Image.fromarray(np.flipud((255 * gray).astype(np.uint8)), mode="L").save(path)


def shift_add_stack(items, grid_ra, grid_dec, ra, dec, pmra, pmdec, center_epoch, clip):
    """Stack cutouts with each one moved back along the proper motion; items = [(record, cutout)]."""
    images = []
    for record, cutout in items:
        shift = core.proper_motion_shift(record["mjd"], ra, dec, pmra, pmdec, center_epoch)
        images.append(core.resample_cutout(cutout, grid_ra, grid_dec, shift)[0])
    return core.stack_images(images, clip=clip)


def make_frames(records, ra, dec, fov_deg, mode, pmra, pmdec, center_epoch, out_dir: Path,
                gap_days=GAP_DAYS, max_span_days=core.MAX_SPAN_DAYS, clip=core.DEFAULT_CLIP):
    """Write n.png, stacks.npz and frames.json into out_dir; return the frames.json content."""
    out_dir.mkdir(parents=True, exist_ok=True)
    # Same grid size rule as the backend (no forced odd size), so the stacks keep their shape.
    grid, n = core.make_grid(ra, dec, fov_deg, SCALE_ARCSEC, odd=False)
    grid_ra, grid_dec = core.grid_world(grid, n)

    loaded = []  # (record, cutout)
    for record in records:
        try:
            loaded.append((record, core.load_cutout(record["path"])))
        except (OSError, KeyError, ValueError):
            continue  # unreadable cutout: skip it, keep going

    def sample(items):
        images = [core.resample_cutout(c, grid_ra, grid_dec)[0] for _, c in items]
        return core.stack_images(images, clip=clip)

    def meta(items):
        mjds = [r["mjd"] for r, _ in items]
        waves = [r["wavelength_um"] for r, _ in items]
        return {
            "t_start": mjd_to_date(min(mjds)), "t_end": mjd_to_date(max(mjds)),
            "mjd_mean": round(float(np.mean(mjds)), 4),
            "detector": items[0][0]["detector"],
            "wavelength_um": [round(min(waves), 3), round(max(waves), 3)],
            "n_images": len(items),
            "flagged_fraction": round(float(np.mean([c.masked_fraction for _, c in items])), 4),
        }

    if not loaded:
        stacks, metas = [], []
    elif mode == "shift_add":
        if pmra is None or pmdec is None:
            raise ValueError("shift_add needs pmra and pmdec")
        stacks = [sample(loaded),
                  shift_add_stack(loaded, grid_ra, grid_dec, ra, dec, pmra, pmdec, center_epoch, clip)]
        metas = [meta(loaded), meta(loaded)]
    else:
        groups = core.split_epochs(loaded, gap_days, max_span_days, mjd=lambda item: item[0]["mjd"])
        stacks = [sample(g) for g in groups]
        metas = [meta(g) for g in groups]

    rng = display_range(stacks, mode)
    frames = []
    for i, (data, info) in enumerate(zip(stacks, metas)):
        write_png(data, rng, out_dir / f"{i}.png")
        frames.append({"n": i, **info})
    if stacks:
        np.savez_compressed(out_dir / "stacks.npz", stacks=np.array(stacks, dtype=np.float32))

    result = {
        "grid": {"ra": ra, "dec": dec, "scale_arcsec": SCALE_ARCSEC, "width": n, "height": n},
        "display_range": rng,
        "frames": frames,
        "n_unreadable": len(records) - len(loaded),
    }
    (out_dir / "frames.json").write_text(json.dumps(result, indent=1), encoding="utf-8")
    return result
