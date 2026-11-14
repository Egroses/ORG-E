"""Aperture photometry on cached cutouts: spectrum (all detectors) and light curve (one).

Every cutout gives one point at its own wavelength (SPHEREx LVF): flux in a 2-pixel aperture
minus the median of a 4-7 pixel annulus, error from VARIANCE, wavelength from WCS-WAVE at the
source pixel. MJy/sr x pixel solid angle -> mJy. The pixel area is the nominal 6.15" x 6.15";
the official solid-angle map would be more exact (noted in the README).
Only cached cutouts are used: no archive request is made here.
"""

import csv
import logging
import math
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
ANNULUS_PX = (4.0, 7.0)
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


@lru_cache(maxsize=20000)
def measure(path, ra, dec):
    """(wavelength_um, flux_mjy, err_mjy, flagged) at (ra, dec) in one cutout, or None."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", FITSFixedWarning)
        with fits.open(path, memmap=False) as hdul:
            image = hdul["IMAGE"].data.astype(np.float64) - hdul["ZODI"].data.astype(np.float64)
            variance = hdul["VARIANCE"].data.astype(np.float64)
            flags = hdul["FLAGS"].data.astype(np.int64)
            bits = _bit_numbers(hdul["FLAGS"].header)
            sky_wcs = WCS(hdul["IMAGE"].header)
            x, y = (float(v) for v in sky_wcs.all_world2pix(ra, dec, 0))
            ny, nx = image.shape
            if not (ANNULUS_PX[1] <= x < nx - ANNULUS_PX[1] and ANNULUS_PX[1] <= y < ny - ANNULUS_PX[1]):
                return None
            wave_wcs = WCS(hdul["IMAGE"].header, fobj=hdul, key="W")
            wave_wcs.sip = None
            wavelength, _ = wave_wcs.pixel_to_world(x, y)
            wavelength_um = float(wavelength.to(u.um).value)

    yy, xx = np.indices(image.shape)
    r = np.hypot(xx - x, yy - y)
    aperture = r <= APERTURE_PX
    annulus = (r >= ANNULUS_PX[0]) & (r <= ANNULUS_PX[1])
    bad = (flags & (_mask_bits(BAD_BITS, bits) | _mask_bits(SATURATION_BITS, bits))) != 0

    sky = image[annulus & ~bad & np.isfinite(image)]
    background = float(np.median(sky)) if sky.size >= 5 else 0.0
    values = image[aperture]
    if not np.isfinite(values).any():
        return None
    finite = np.isfinite(values)
    flux = float(np.sum(values[finite] - background)) * PIXEL_SR * 1e9  # MJy -> mJy
    err = math.sqrt(float(np.nansum(variance[aperture][finite]))) * PIXEL_SR * 1e9
    flagged = bool(bad[aperture].any() or not finite.all())
    return round(wavelength_um, 4), round(flux, 4), round(err, 4), flagged


def photometry(ra, dec, pmra=None, pmdec=None, detector=None, epoch=config.CENTER_EPOCH):
    """One point per cached cutout covering the position."""
    points = []
    for record in covering_records(ra, dec, detector):
        sra, sdec = position_at(ra, dec, pmra, pmdec, record["mjd"], epoch)
        try:
            result = measure(record["path"], round(sra, 7), round(sdec, 7))
        except (OSError, KeyError, ValueError):
            continue
        if result is None:
            continue
        wavelength_um, flux, err, flagged = result
        points.append({"wavelength_um": wavelength_um, "flux_mjy": flux, "err_mjy": err,
                       "mjd": round(record["mjd"], 5), "detector": record["detector"], "flagged": flagged})
    return points
