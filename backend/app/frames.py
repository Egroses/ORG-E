"""Frame maker used until the imaging module is wired in.

Follows docs/wdd-goruntu-isleme.md in a simplified form:
IMAGE - ZODI, sigma-clipped background, flag mask (saturated cores kept), nearest-neighbour
resampling onto one north-up grid, epoch grouping, median stacking, one shared display range,
asinh PNGs flipped so north is up.
"""

import json
import warnings
from datetime import date, timedelta
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.stats import sigma_clipped_stats
from astropy.wcs import WCS, FITSFixedWarning
from PIL import Image

SCALE_ARCSEC = 3.075
GAP_DAYS = 10.0

BAD_BITS = {"TRANSIENT", "NONFUNC", "MISSING_DATA", "HOT", "COLD", "PHANMISS", "PERSIST",
            "OUTLIER", "STREAK", "SNOWBALL"}
SATURATION_BITS = {"OVERFLOW", "SUR_ERROR", "BLOOM"}
# Bit numbers measured on 14 Nov; used if a header has no MSKN* keywords.
DEFAULT_BITS = {"TRANSIENT": 0, "OVERFLOW": 1, "SUR_ERROR": 2, "NONFUNC": 6, "MISSING_DATA": 9,
                "HOT": 10, "COLD": 11, "PHANMISS": 14, "PERSIST": 17, "OUTLIER": 19,
                "STREAK": 25, "BLOOM": 26, "SNOWBALL": 27}


# ---------- grid ----------

def target_wcs(ra, dec, fov_deg, scale_arcsec=SCALE_ARCSEC):
    n = int(round(fov_deg * 3600 / scale_arcsec))
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra, dec]
    w.wcs.crpix = [(n + 1) / 2, (n + 1) / 2]
    w.wcs.cdelt = [-scale_arcsec / 3600, scale_arcsec / 3600]
    w.wcs.cunit = ["deg", "deg"]
    return w, (n, n)


def grid_world(wcs, shape):
    """RA/Dec (degrees) of every grid pixel centre."""
    yy, xx = np.indices(shape)
    ra, dec = wcs.all_pix2world(xx, yy, 0)
    return ra, dec


# ---------- one cutout ----------

def _bit_numbers(header):
    bits = {}
    for key, value in header.items():
        if key.startswith("MSKN") and key[4:].isdigit():
            bits[str(value).strip().upper()] = int(key[4:])
    return bits or DEFAULT_BITS


def _mask_bits(names, bits):
    value = 0
    for name in names:
        if name in bits:
            value |= 1 << bits[name]
    return value


def load_cutout(path):
    """Background-subtracted image (NaN where masked), its WCS and the masked fraction."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", FITSFixedWarning)
        with fits.open(path, memmap=False) as hdul:
            image = hdul["IMAGE"].data.astype(np.float64) - hdul["ZODI"].data.astype(np.float64)
            flags = hdul["FLAGS"].data.astype(np.int64)
            bits = _bit_numbers(hdul["FLAGS"].header)
            wcs = WCS(hdul["IMAGE"].header)
    bad = (flags & _mask_bits(BAD_BITS, bits)) != 0
    saturated = (flags & _mask_bits(SATURATION_BITS, bits)) != 0
    mask = (bad & ~saturated) | ~np.isfinite(image)
    image[mask] = np.nan
    finite = image[np.isfinite(image)]
    if finite.size > 10:
        _, median, _ = sigma_clipped_stats(finite, sigma=3.0)
        image -= median
    return image, wcs, float(mask.mean())


def resample(image, wcs, ra, dec):
    """Nearest-neighbour sample of `image` at the given sky positions (NaN outside)."""
    x, y = wcs.all_world2pix(ra, dec, 0)
    xi, yi = np.rint(x).astype(int), np.rint(y).astype(int)
    inside = (xi >= 0) & (yi >= 0) & (xi < image.shape[1]) & (yi < image.shape[0])
    out = np.full(ra.shape, np.nan)
    out[inside] = image[yi[inside], xi[inside]]
    return out


# ---------- grouping, stacking, PNG ----------

def group_by_epoch(records, gap_days=GAP_DAYS):
    groups = []
    for record in sorted(records, key=lambda r: r["mjd"]):
        if groups and record["mjd"] - groups[-1][-1]["mjd"] <= gap_days:
            groups[-1].append(record)
        else:
            groups.append([record])
    return groups


def stack(arrays):
    cube = np.array(arrays)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN pixels stay NaN
        return np.nanmedian(cube, axis=0) if len(arrays) >= 3 else np.nanmean(cube, axis=0)


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


# ---------- entry point ----------

def make_frames(records, ra, dec, fov_deg, mode, pmra, pmdec, center_epoch, out_dir: Path):
    """Write n.png, stacks.npz and frames.json into out_dir; return the frames.json content."""
    out_dir.mkdir(parents=True, exist_ok=True)
    wcs, shape = target_wcs(ra, dec, fov_deg)
    grid_ra, grid_dec = grid_world(wcs, shape)

    loaded = []
    for record in records:
        try:
            image, cwcs, masked = load_cutout(record["path"])
        except (OSError, KeyError, ValueError):
            continue  # unreadable cutout: skip it, keep going
        loaded.append((record, image, cwcs, masked))

    def sample(items, shifted):
        arrays = []
        for record, image, cwcs, _ in items:
            sra, sdec = grid_ra, grid_dec
            if shifted:
                year = 2000.0 + (record["mjd"] - 51544.5) / 365.25
                dt = year - center_epoch
                sra = grid_ra + (pmra / 3.6e6) * dt / np.cos(np.radians(dec))
                sdec = grid_dec + (pmdec / 3.6e6) * dt
            arrays.append(resample(image, cwcs, sra, sdec))
        return stack(arrays)

    def meta(items):
        mjds = [r["mjd"] for r, *_ in items]
        waves = [r["wavelength_um"] for r, *_ in items]
        return {
            "t_start": mjd_to_date(min(mjds)), "t_end": mjd_to_date(max(mjds)),
            "mjd_mean": round(float(np.mean(mjds)), 4),
            "detector": items[0][0]["detector"],
            "wavelength_um": [round(min(waves), 3), round(max(waves), 3)],
            "n_images": len(items),
            "flagged_fraction": round(float(np.mean([m for *_, m in items])), 4),
        }

    if not loaded:
        stacks, metas = [], []
    elif mode == "shift_add":
        stacks = [sample(loaded, False), sample(loaded, True)]
        metas = [meta(loaded), meta(loaded)]
    else:
        by_record = {id(item[0]): item for item in loaded}
        groups = [[by_record[id(r)] for r in group if id(r) in by_record]
                  for group in group_by_epoch([item[0] for item in loaded])]
        stacks = [sample(group, False) for group in groups]
        metas = [meta(group) for group in groups]

    rng = display_range(stacks, mode)
    frames = []
    for n, (data, info) in enumerate(zip(stacks, metas)):
        write_png(data, rng, out_dir / f"{n}.png")
        frames.append({"n": n, **info})
    if stacks:
        np.savez_compressed(out_dir / "stacks.npz", stacks=np.array(stacks, dtype=np.float32))

    result = {
        "grid": {"ra": ra, "dec": dec, "scale_arcsec": SCALE_ARCSEC, "width": shape[1], "height": shape[0]},
        "display_range": rng,
        "frames": frames,
        "n_unreadable": len(records) - len(loaded),
    }
    (out_dir / "frames.json").write_text(json.dumps(result, indent=1), encoding="utf-8")
    return result
