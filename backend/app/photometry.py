"""Aperture photometry on cached cutouts: spectrum (all detectors) and light curve (one).

Every cutout gives one point at its own wavelength (SPHEREx LVF): flux in a 2-pixel aperture
(1-3 on request) minus the median of a 4-7 pixel annulus, error from VARIANCE, wavelength from
WCS-WAVE at the source pixel. MJy/sr x pixel solid angle -> mJy. The pixel area is the nominal
6.15" x 6.15"; the official solid-angle map would be more exact (noted in the README).
Only cached cutouts are used: no archive request is made here.

Flag policy (bit meanings from the FLAGS header, MSKD* keywords; backend/docs/spectrum-api.md):
- saturation bits (OVERFLOW, SUR_ERROR, BLOOM) in the aperture: value kept, `saturated`, `lower_limit`;
- NaN pixels in the aperture (`masked_px`): value kept (sum of the finite pixels), `lower_limit`;
- hard bad bits (HARD_BITS) in the aperture: `flagged`, left out of the 102-channel medians;
- every other bit (TRANSIENT included: "transient detected during SUR", a jump in the up-the-ramp
  fit) is only listed in `flag_names`.
"""

import csv
import logging
import math
import threading
import warnings
from functools import lru_cache
from pathlib import Path

import astropy.units as u
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS, FITSFixedWarning

from . import config
from .frames import BAD_BITS, SATURATION_BITS, _bit_numbers, _mask_bits

logging.getLogger("astropy").setLevel(logging.ERROR)  # harmless SIP notice on every cutout

PIXEL_ARCSEC = 6.15
PIXEL_SR = (PIXEL_ARCSEC / 206264.806) ** 2
APERTURE_PX = 2.0
APERTURE_RANGE = (1.0, 3.0)
ANNULUS_PX = (4.0, 7.0)

HARD_BITS = {"NONFUNC", "HOT", "COLD", "PERSIST", "OUTLIER", "STREAK", "SNOWBALL", "MISSING_DATA", "PHANMISS"}
NOT_LISTED = {"FULLSAMPLE", "SOURCE"}  # status bits, not problems (as in docs/patch-api.md rule 9)

# 102-channel spectrum: 17 channels per detector, evenly spaced in log(wavelength) over the range the
# cached cutouts cover (measured on Barnard's Star, 15 Nov; close to the nominal SPHEREx bands).
CHANNELS_PER_DETECTOR = 17
DETECTOR_RANGE_UM = {1: (0.74, 1.11), 2: (1.08, 1.67), 3: (1.62, 2.42),
                     4: (2.41, 3.81), 5: (3.80, 4.43), 6: (4.41, 5.01)}
CACHE_DIR = config.REPO_ROOT / "cache"


# ---------- which cached cutouts cover a position ----------

def _units():
    """(directory, ra_center, dec_center, size_deg) of every cached unit with a manifest."""
    units = []
    for manifest in CACHE_DIR.glob("**/D[1-6]/manifest.csv"):
        with open(manifest, encoding="utf-8", newline="") as handle:
            first = next(csv.DictReader(handle), None)
        if first:
            units.append((manifest.parent, float(first["ra_center"]), float(first["dec_center"]),
                          float(first["size_deg"])))
    return units


def _separation_deg(ra1, dec1, ra2, dec2):
    d1, d2 = math.radians(dec1), math.radians(dec2)
    cos = (math.sin(d1) * math.sin(d2)
           + math.cos(d1) * math.cos(d2) * math.cos(math.radians(ra1 - ra2)))
    return math.degrees(math.acos(max(-1.0, min(1.0, cos))))


def covering_records(ra, dec, detector=None):
    """Manifest rows (with path) of cached cutouts whose centre is close enough to (ra, dec)."""
    records = []
    for directory, ra0, dec0, size in _units():
        if _separation_deg(ra, dec, ra0, dec0) > size / 2 - ANNULUS_PX[1] * PIXEL_ARCSEC / 3600:
            continue
        with open(directory / "manifest.csv", encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                if detector is None or int(row["detector"]) == detector:
                    records.append({"path": str(directory / row["file"]), "mjd": float(row["mjd"]),
                                    "detector": int(row["detector"])})
    return records


# ---------- one measurement ----------

def position_at(ra, dec, pmra, pmdec, mjd, epoch):
    if pmra is None or pmdec is None:
        return ra, dec
    years = 2000.0 + (mjd - 51544.5) / 365.25 - epoch
    return (ra + pmra * years / 3.6e6 / math.cos(math.radians(dec)), dec + pmdec * years / 3.6e6)


_wcs_lock = threading.Lock()  # wcslib objects are shared between request threads


@lru_cache(maxsize=4000)
def _load(path):
    """Pixels, flags and both WCS of one cutout, kept in memory (building the WCS is most of the cost).

    About 140 kB per cutout: R Draconis, the largest target, has ~2500 cutouts (~350 MB).
    """
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", FITSFixedWarning)
        with fits.open(path, memmap=False) as hdul:
            image = (hdul["IMAGE"].data.astype(np.float64) - hdul["ZODI"].data.astype(np.float64)).astype(np.float32)
            variance = hdul["VARIANCE"].data.astype(np.float32)
            bits = _bit_numbers(hdul["FLAGS"].header)
            flags = hdul["FLAGS"].data.astype(np.int64).astype(np.uint32)
            sky_wcs = WCS(hdul["IMAGE"].header)
            wave_wcs = WCS(hdul["IMAGE"].header, fobj=hdul, key="W")
            wave_wcs.sip = None
    return image, variance, flags, bits, sky_wcs, wave_wcs


@lru_cache(maxsize=40000)
def measure(path, ra, dec, aperture_px=APERTURE_PX):
    """One measurement at (ra, dec) in one cutout (dict, see the module docstring), or None."""
    image32, variance32, flags, bits, sky_wcs, wave_wcs = _load(path)
    with _wcs_lock:
        x, y = (float(v) for v in sky_wcs.all_world2pix(ra, dec, 0))
    ny, nx = image32.shape
    if not (ANNULUS_PX[1] <= x < nx - ANNULUS_PX[1] and ANNULUS_PX[1] <= y < ny - ANNULUS_PX[1]):
        return None
    with _wcs_lock:
        wavelength, _ = wave_wcs.pixel_to_world(x, y)
    wavelength_um = float(wavelength.to(u.um).value)
    image = image32.astype(np.float64)
    variance = variance32.astype(np.float64)

    yy, xx = np.indices(image.shape)
    r = np.hypot(xx - x, yy - y)
    aperture = r <= aperture_px
    annulus = (r >= ANNULUS_PX[0]) & (r <= ANNULUS_PX[1])
    sky_bad = (flags & _mask_bits(BAD_BITS | SATURATION_BITS, bits)) != 0

    sky = image[annulus & ~sky_bad & np.isfinite(image)]
    background = float(np.median(sky)) if sky.size >= 5 else 0.0
    values = image[aperture]
    finite = np.isfinite(values)
    if not finite.any():
        return None
    flux = float(np.sum(values[finite] - background)) * PIXEL_SR * 1e9  # MJy -> mJy
    err = math.sqrt(float(np.nansum(variance[aperture][finite]))) * PIXEL_SR * 1e9

    in_aperture = int(np.bitwise_or.reduce(flags[aperture]))
    names = sorted((name for name, bit in bits.items() if in_aperture & (1 << bit) and name not in NOT_LISTED),
                   key=lambda name: bits[name])
    saturated = bool(in_aperture & _mask_bits(SATURATION_BITS, bits))
    masked_px = int((~finite).sum())
    return {"wavelength_um": round(wavelength_um, 4), "flux_mjy": round(flux, 4), "err_mjy": round(err, 4),
            "flagged": bool(in_aperture & _mask_bits(HARD_BITS, bits)), "saturated": saturated,
            "masked_px": masked_px, "flag_names": tuple(names), "lower_limit": saturated or masked_px > 0}


def photometry(ra, dec, pmra=None, pmdec=None, detector=None, epoch=config.CENTER_EPOCH, aperture_px=APERTURE_PX):
    """One point per cached cutout covering the position."""
    points = []
    for record in covering_records(ra, dec, detector):
        sra, sdec = position_at(ra, dec, pmra, pmdec, record["mjd"], epoch)
        try:
            result = measure(record["path"], round(sra, 7), round(sdec, 7), float(aperture_px))
        except (OSError, KeyError, ValueError):
            continue
        if result is None:
            continue
        points.append({**result, "flag_names": list(result["flag_names"]),
                       "mjd": round(record["mjd"], 5), "detector": record["detector"]})
    return points


# ---------- 102-channel spectrum ----------

def channel_edges(detector):
    lo, hi = DETECTOR_RANGE_UM[detector]
    return [lo * (hi / lo) ** (i / CHANNELS_PER_DETECTOR) for i in range(CHANNELS_PER_DETECTOR + 1)]


def channel_of(detector, wavelength_um):
    """Channel 0-16 of a wavelength in one detector (values just outside the range go to the end channels)."""
    lo, hi = DETECTOR_RANGE_UM[detector]
    i = int(math.floor(CHANNELS_PER_DETECTOR * math.log(wavelength_um / lo) / math.log(hi / lo)))
    return min(max(i, 0), CHANNELS_PER_DETECTOR - 1)


def channel_spectrum(points):
    """102 channels (6 detectors x 17): median flux of the usable exposures in each channel.

    Exposures with a hard bad bit (`flagged`) are left out and counted in `n_skipped`. The error of
    the median is 1.2533 x sqrt(sum err^2) / N (median of N Gaussian values). A channel with no usable
    exposure has flux and error null.
    """
    groups = {}
    for p in points:
        groups.setdefault((p["detector"], channel_of(p["detector"], p["wavelength_um"])), []).append(p)
    channels = []
    for detector in range(1, 7):
        edges = channel_edges(detector)
        for index in range(CHANNELS_PER_DETECTOR):
            group = groups.get((detector, index), [])
            used = [p for p in group if not p["flagged"]]
            flux = err = None
            if used:
                flux = round(float(np.median([p["flux_mjy"] for p in used])), 4)
                err = round(1.2533 * math.sqrt(sum(p["err_mjy"] ** 2 for p in used)) / len(used), 4)
            channels.append({
                "detector": detector, "index": index,
                "wavelength_um": round(math.sqrt(edges[index] * edges[index + 1]), 4),
                "wavelength_range_um": [round(edges[index], 4), round(edges[index + 1], 4)],
                "flux_mjy": flux, "err_mjy": err, "n_exposures": len(used), "n_skipped": len(group) - len(used),
                "saturated": any(p["saturated"] for p in used), "lower_limit": any(p["lower_limit"] for p in used),
            })
    return channels
