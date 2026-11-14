"""Validation report for the five cached test targets (detectors 2, 4, 6).

    python -m imaging.validate --cache E:\\nasa\\ORG-E\\cache

Prints epochs, exposures per band, run time and noise, then the key checks: Barnard's Star proper
motion and orientation, WISE 0855 shift-and-add SNR against backend/app/frames.py, and the
clip / no-clip comparison on the two variable stars. The helpers are also used by the tests.
AI-assisted code (Claude Code).
"""

import argparse
import sys
import tempfile
import time
from pathlib import Path

import numpy as np

from . import core, encode_patch, make_frames, make_patch
from .patch import decode_frame
from .records import load_records, load_records_by_detector

DEFAULT_CACHE = r"E:\nasa\ORG-E\cache"
CENTER_EPOCH = 2026.0
APERTURE_R = 4.0   # grid pixels

# ra/dec at epoch 2026.0 (pipeline/targets.json); pm in mas/yr (backend/app/targets.py)
TARGETS = {
    "barnard": dict(ra=269.446271, dec=4.768197, pmra=-801.6, pmdec=10362.0),
    "epsindb": dict(ra=331.096658, dec=-56.800657, pmra=3982.0, pmdec=-2466.8),
    "wise0855": dict(ra=133.759871, dec=-7.242252, pmra=-8124.0, pmdec=673.0),
    "rwaur": dict(ra=76.956590, dec=30.401293, pmra=7.2, pmdec=-20.3),
    "rdra": dict(ra=248.167233, dec=66.755024, pmra=-20.6, pmdec=6.1),
}


# ---------- measurement helpers ----------

def expected_pixel(target, mjd, n, scale=core.SCALE_ARCSEC):
    """Where the target should be at `mjd` on the grid (0-based x = column, y = row, FITS order)."""
    grid, _ = core.make_grid(target["ra"], target["dec"], n * scale / 3600.0, scale)
    d_ra, d_dec = core.proper_motion_shift(mjd, target["ra"], target["dec"], target["pmra"],
                                           target["pmdec"], CENTER_EPOCH)
    x, y = grid.world2pix(target["ra"] + d_ra, target["dec"] + d_dec)
    return float(x), float(y)


def aperture_snr(stack, x0, y0, r=APERTURE_R):
    """(snr, flux, aperture noise). Noise = MAD of the same aperture placed on empty sky (>15 px from
    the source), so correlated pixels from bilinear smoothing cannot fake a gain."""
    yy, xx = np.indices(stack.shape)
    med = np.nanmedian(stack)
    ap = np.hypot(xx - x0, yy - y0) <= r
    flux = float(np.sum(stack[ap] - med)) if np.isfinite(stack[ap]).all() else float(np.nansum(stack[ap] - med))
    sums = []
    n = stack.shape[0]
    for cy in range(8, n - 8, 4):
        for cx in range(8, n - 8, 4):
            if np.hypot(cx - x0, cy - y0) < 15:
                continue
            v = stack[np.hypot(xx - cx, yy - cy) <= r]
            if np.isfinite(v).all():
                sums.append(np.sum(v - med))
    sums = np.array(sums)
    if sums.size < 10:
        return float("nan"), flux, float("nan")
    sigma = 1.4826 * np.median(np.abs(sums - np.median(sums)))
    return flux / sigma, flux, float(sigma)


def centroid(stack, x0, y0, radius=10.0):
    """Flux-weighted centroid within `radius` of (x0, y0), background from the 7-11 px ring."""
    yy, xx = np.indices(stack.shape)
    r = np.hypot(xx - x0, yy - y0)
    ring = stack[(r >= 7) & (r <= 11) & np.isfinite(stack)]
    bg = np.median(ring) if ring.size else 0.0
    w = np.where((r <= radius) & np.isfinite(stack), np.clip(stack - bg, 0, None), 0.0)
    if w.sum() <= 0:
        return float("nan"), float("nan")
    return float((w * xx).sum() / w.sum()), float((w * yy).sum() / w.sum())


# ---------- checks ----------

def barnard_check(cache, clip=core.DEFAULT_CLIP):
    """Northward shift first -> last epoch of D6 against the proper-motion expectation."""
    t = TARGETS["barnard"]
    patch = make_patch({6: load_records(cache, "barnard", 6)}, t["ra"], t["dec"], clip=clip)
    idx = [i for i, row in enumerate(patch.frames) if row[0] is not None]
    first, last = idx[0], idx[-1]
    cy = {}
    for i in (first, last):
        x0, y0 = expected_pixel(t, patch.epochs[i]["mjd_mean"], patch.size)
        cy[i] = centroid(patch.frames[i][0].data, x0, y0)[1]
    years = (patch.epochs[last]["mjd_mean"] - patch.epochs[first]["mjd_mean"]) / 365.25
    measured = (cy[last] - cy[first]) * patch.scale_arcsec      # FITS rows grow to the north
    expected = t["pmdec"] / 1000.0 * years
    payload = encode_patch(patch, "validate")
    rows = []
    for i in (first, last):                                      # same centroid, display order
        data, _ = decode_frame(payload, i, 0)
        x0, y0 = expected_pixel(t, patch.epochs[i]["mjd_mean"], patch.size)
        rows.append(centroid(data, x0, patch.size - 1 - y0)[1])
    return {"measured_arcsec": measured, "expected_arcsec": expected, "years": years,
            "ratio": measured / expected, "display_rows": rows, "epochs": (first, last)}


def wise_check(cache, clip=core.DEFAULT_CLIP):
    """Empirical aperture SNR of the shift-and-add stack, ours against backend/app/frames.py."""
    t = TARGETS["wise0855"]
    records = load_records(cache, "wise0855", 6)
    out = {}
    with tempfile.TemporaryDirectory() as tmp:
        ours = make_frames(records, t["ra"], t["dec"], 0.1, "shift_add", t["pmra"], t["pmdec"],
                           CENTER_EPOCH, Path(tmp) / "ours", clip=clip)
        stack = np.load(Path(tmp) / "ours" / "stacks.npz")["stacks"][1].astype(np.float64)
        out["grid"] = ours["grid"]["width"]
        out["ours"] = aperture_snr(stack, (stack.shape[1] - 1) / 2, (stack.shape[0] - 1) / 2)
        out["centroid"] = centroid(stack, (stack.shape[1] - 1) / 2, (stack.shape[0] - 1) / 2)
        out["centre"] = ((stack.shape[1] - 1) / 2, (stack.shape[0] - 1) / 2)
        try:
            from backend.app import frames as backend_frames
        except ImportError:
            return out
        backend_frames.make_frames(records, t["ra"], t["dec"], 0.1, "shift_add", t["pmra"], t["pmdec"],
                                   CENTER_EPOCH, Path(tmp) / "backend")
        base = np.load(Path(tmp) / "backend" / "stacks.npz")["stacks"][1].astype(np.float64)
        out["backend"] = aperture_snr(base, (base.shape[1] - 1) / 2, (base.shape[0] - 1) / 2)
    return out


def variable_check(cache, target):
    """Per-epoch aperture flux of the target with clip=True and clip=False (D6)."""
    t = TARGETS[target]
    records = {6: load_records(cache, target, 6)}
    fluxes = {}
    for clip in (True, False):
        patch = make_patch(records, t["ra"], t["dec"], clip=clip)
        n = patch.size
        fluxes[clip] = [aperture_snr(row[0].data, (n - 1) / 2, (n - 1) / 2)[1] if row[0] else float("nan")
                        for row in patch.frames]
    clipped, plain = np.array(fluxes[True]), np.array(fluxes[False])
    rel = np.abs(clipped - plain) / np.abs(plain)
    return {"flux_clip": clipped, "flux_noclip": plain, "max_rel_diff": float(np.nanmax(rel))}


# ---------- report ----------

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--cache", default=DEFAULT_CACHE)
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")   # dates contain an en dash
    cache = Path(args.cache)
    print(f"default clip = {core.DEFAULT_CLIP}\n")
    for key, t in TARGETS.items():
        records = load_records_by_detector(cache, key, (2, 4, 6))
        t0 = time.time()
        patch = make_patch(records, t["ra"], t["dec"])
        seconds = time.time() - t0
        total = sum(len(v) for v in records.values())
        print(f"== {key}: {total} exposures, {len(patch.epochs)} epochs, grid {patch.size}, {seconds:.2f} s, "
              f"warnings {patch.warnings}")
        for e, row in zip(patch.epochs, patch.frames):
            cells = []
            for band, f in zip(patch.bands, row):
                cells.append(f"D{band['detector']}: " + ("-" if f is None else f"{f.n_images:3d} img noise {f.noise:.4f}"))
            print(f"   {e['index']:2d} {e['label']:>12s}  {e['dates']:<24s} " + " | ".join(cells))
    print("\n== Barnard's Star D6, first -> last epoch")
    b = barnard_check(cache)
    print(f"   northward shift {b['measured_arcsec']:.2f} arcsec over {b['years']:.2f} yr, expected "
          f"{b['expected_arcsec']:.2f} (ratio {b['ratio']:.3f}); display-order centroid rows "
          f"{b['display_rows'][0]:.2f} -> {b['display_rows'][1]:.2f} (must decrease)")
    print("\n== WISE 0855 D6 shift-and-add, aperture r = 4 px, empirical noise")
    w = wise_check(cache)
    print(f"   ours    SNR {w['ours'][0]:.1f} flux {w['ours'][1]:.2f} noise {w['ours'][2]:.3f}; "
          f"centroid {w['centroid'][0]:.2f},{w['centroid'][1]:.2f} vs centre {w['centre'][0]:.1f}")
    if "backend" in w:
        print(f"   backend SNR {w['backend'][0]:.1f} flux {w['backend'][1]:.2f} noise {w['backend'][2]:.3f}")
    print("\n== variable stars D6: aperture flux per epoch, clip vs no clip")
    for key in ("rwaur", "rdra"):
        v = variable_check(cache, key)
        print(f"   {key}: max relative difference {100 * v['max_rel_diff']:.1f} %")
        print(f"      clip   {np.round(v['flux_clip'], 1).tolist()}")
        print(f"      noclip {np.round(v['flux_noclip'], 1).tolist()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
