"""Patch builder and encoder for `GET /api/patch` (contract: docs/patch-api.md).

`make_patch` loads every exposure, resamples it onto one grid, splits epochs from the exposures of
ALL requested detectors (so the epoch list is shared), and stacks per (epoch, detector).
`encode_patch` flips rows to display order (row 0 = north) and base64-encodes the arrays.
AI-assisted code (Claude Code).
"""

from __future__ import annotations

import base64
import functools
import os
import threading
from concurrent.futures import ProcessPoolExecutor, as_completed
from concurrent.futures.process import BrokenProcessPool
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Callable, Optional

import numpy as np

from . import core

# SPHEREx detector wavelength coverage, microns (the contract shows D2, D4, D6).
BANDS_UM = {1: (0.75, 1.09), 2: (1.10, 1.62), 3: (1.63, 2.41), 4: (2.42, 3.82), 5: (3.83, 4.41), 6: (4.42, 5.00)}
COLLECTIONS = ("dr1", "qr3", "dr1_deep", "qr3_deep")
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
ORIENTATION = "row 0 = north, column 0 = east"
DASH = "–"


@dataclass
class PatchFrame:
    data: np.ndarray          # float32 (size, size), MJy/sr, NaN = masked, FITS order (row 0 = south)
    flag_share: np.ndarray    # uint8 (size, size), same order
    noise: float              # 1-sigma sky noise, MJy/sr (NaN if it could not be measured)
    n_images: int


@dataclass
class Patch:
    ra: float
    dec: float
    fov_deg: float
    size: int
    scale_arcsec: float
    epochs: list = field(default_factory=list)    # dicts: index, mjd_start, mjd_end, mjd_mean, label, dates, n_images
    bands: list = field(default_factory=list)     # dicts: detector, wavelength_um
    frames: list = field(default_factory=list)    # frames[epoch][band] -> PatchFrame | None
    data_release: dict = field(default_factory=dict)
    warnings: list = field(default_factory=list)


# ---------- dates ----------

def mjd_to_date(mjd):
    return date(1858, 11, 17) + timedelta(days=int(np.floor(mjd)))


def format_dates(mjd_start, mjd_end):
    """Plain-language window: '15 Aug - 1 Oct 2025', '15 - 20 Aug 2025', '15 Aug 2025' (en dash)."""
    a, b = mjd_to_date(mjd_start), mjd_to_date(mjd_end)
    ma, mb = MONTHS[a.month - 1], MONTHS[b.month - 1]
    if a == b:
        return f"{a.day} {ma} {a.year}"
    if (a.year, a.month) == (b.year, b.month):
        return f"{a.day} {DASH} {b.day} {ma} {a.year}"
    if a.year == b.year:
        return f"{a.day} {ma} {DASH} {b.day} {mb} {b.year}"
    return f"{a.day} {ma} {a.year} {DASH} {b.day} {mb} {b.year}"


def epoch_labels(mjd_means):
    """'Aug 2025' from the mean date; if two epochs share a month the day is added."""
    dates = [mjd_to_date(m) for m in mjd_means]
    labels = [f"{MONTHS[d.month - 1]} {d.year}" for d in dates]
    return [f"{d.day} {lab}" if labels.count(lab) > 1 else lab for d, lab in zip(dates, labels)]


# ---------- build ----------

@functools.lru_cache(maxsize=4)
def _grid_maps(ra, dec, fov_deg, scale_arcsec):
    grid, n = core.make_grid(ra, dec, fov_deg, scale_arcsec, odd=True)
    return core.grid_world(grid, n)


def _load_one(path, ra, dec, fov_deg, scale_arcsec):
    """Read one cutout and put it on the grid; None if it cannot be read. Runs in a worker process."""
    try:
        grid_ra, grid_dec = _grid_maps(ra, dec, fov_deg, scale_arcsec)
        return core.resample_cutout(core.load_cutout(path), grid_ra, grid_dec)
    except (OSError, KeyError, ValueError):
        return None


_POOL = None
_POOL_LOCK = threading.Lock()


def _get_pool(workers):
    """One process pool shared by all patches: starting processes costs about a second each time.
    Reading and resampling is Python-bound, so threads would not make it faster."""
    global _POOL
    with _POOL_LOCK:
        if _POOL is None:
            _POOL = ProcessPoolExecutor(workers)
        return _POOL


def _load_all(paths, args, workers, progress):
    """Results in input order. workers=1 runs in this process; any pool failure falls back to it."""
    total, state = len(paths), {"done": 0, "failed": 0}

    def tick(result):
        state["done" if result is not None else "failed"] += 1
        if progress:
            progress(state["done"], total, state["failed"])

    if workers > 1 and total >= 8:
        try:
            futures = {_get_pool(workers).submit(_load_one, p, *args): i for i, p in enumerate(paths)}
            results = [None] * total
            for future in as_completed(futures):
                results[futures[future]] = future.result()
                tick(results[futures[future]])
            return results
        except (BrokenProcessPool, OSError, RuntimeError):
            state.update(done=0, failed=0)
    results = []
    for p in paths:
        results.append(_load_one(p, *args))
        tick(results[-1])
    return results


def make_patch(records_by_detector, ra, dec, fov_deg=0.1, gap_days=core.GAP_DAYS,
               max_span_days=core.MAX_SPAN_DAYS, scale_arcsec=core.SCALE_ARCSEC,
               clip=core.DEFAULT_CLIP, progress: Optional[Callable] = None, workers=None):
    """Build a Patch. `progress(done, total, failed)` is called after every exposure (calling thread).

    workers: processes used to read cutouts (default: up to 8, one per CPU); 1 = in this process.
    """
    n = core.make_grid(ra, dec, fov_deg, scale_arcsec, odd=True)[1]
    workers = workers or min(8, os.cpu_count() or 1)
    detectors = sorted(records_by_detector)
    jobs = [(det, rec) for det in detectors for rec in records_by_detector[det]]
    results = _load_all([rec["path"] for _, rec in jobs], (ra, dec, fov_deg, scale_arcsec), workers, progress)
    failed = sum(1 for r in results if r is None)
    # (detector, record, image, flagged, covered) for the exposures that could be read
    loaded = [(det, rec, *res) for (det, rec), res in zip(jobs, results) if res is not None]

    patch = Patch(ra, dec, fov_deg, n, scale_arcsec, bands=[
        {"detector": d, "wavelength_um": list(BANDS_UM[d])} for d in detectors])
    if failed:
        patch.warnings.append(f"{failed} exposures could not be read")

    groups = core.split_epochs(loaded, gap_days, max_span_days, mjd=lambda item: item[1]["mjd"])
    means = [float(np.mean([item[1]["mjd"] for item in g])) for g in groups]
    labels = epoch_labels(means)
    for index, (group, mean, label) in enumerate(zip(groups, means, labels)):
        mjds = [item[1]["mjd"] for item in group]
        row, counts = [], {}
        for det in detectors:
            part = [item for item in group if item[0] == det]
            if not part:
                row.append(None)
                continue
            data = core.stack_images([item[2] for item in part], clip=clip).astype(np.float32)
            share = core.flag_share([item[3] for item in part], [item[4] for item in part])
            row.append(PatchFrame(data, share, core.noise_estimate(data), len(part)))
            counts[det] = len(part)
        patch.frames.append(row)
        patch.epochs.append({"index": index, "mjd_start": min(mjds), "mjd_end": max(mjds), "mjd_mean": mean,
                             "label": label, "dates": format_dates(min(mjds), max(mjds)), "n_images": counts})

    per_collection = {name: 0 for name in COLLECTIONS}
    for _, rec, *_ in loaded:
        name = rec.get("collection")
        if name:
            per_collection[name] = per_collection.get(name, 0) + 1
    patch.data_release = {"collections": per_collection,
                          "latest_mjd": max((rec["mjd"] for _, rec, *_ in loaded), default=None)}
    return patch


# ---------- encode ----------

def _b64(array):
    return base64.b64encode(np.ascontiguousarray(array).tobytes()).decode("ascii")


def encode_patch(patch, job_id):
    """Patch -> dict exactly as in docs/patch-api.md (status 'done'). Rows are flipped to display order."""
    frames = []
    for row in patch.frames:
        out = []
        for f in row:
            if f is None:
                out.append(None)
                continue
            out.append({"data": _b64(np.flipud(f.data).astype("<f4")),
                        "noise": float(f.noise) if np.isfinite(f.noise) else None,
                        "flag_share": _b64(np.flipud(f.flag_share).astype(np.uint8)),
                        "n_images": f.n_images})
        frames.append(out)
    epochs = [{**e, "n_images": {str(d): c for d, c in e["n_images"].items()}} for e in patch.epochs]
    return {
        "contract": 1,
        "status": "done",
        "id": job_id,
        "source": "irsa",
        "center": {"ra": patch.ra, "dec": patch.dec},
        "fov_deg": patch.fov_deg,
        "size": patch.size,
        "pixel_scale_arcsec": patch.scale_arcsec,
        "unit": "MJy/sr",
        "orientation": ORIENTATION,
        "epochs": epochs,
        "bands": patch.bands,
        "frames": frames,
        "data_release": patch.data_release,
        "warnings": list(patch.warnings),
    }


def decode_frame(payload, epoch, band):
    """Inverse of encode_patch for one frame: (data float32, flag_share uint8) in display order, or None."""
    f = payload["frames"][epoch][band]
    if f is None:
        return None
    size = payload["size"]
    data = np.frombuffer(base64.b64decode(f["data"]), dtype="<f4").reshape(size, size)
    share = np.frombuffer(base64.b64decode(f["flag_share"]), dtype=np.uint8).reshape(size, size)
    return data, share
