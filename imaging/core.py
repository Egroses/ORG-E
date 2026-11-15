"""Building blocks of the imaging module: load, resample, split epochs, stack, measure noise.

Follows docs/wdd-goruntu-isleme.md ("V2 hybrid"): our own preprocessing (IMAGE - ZODI, bad-pixel
mask with saturated cores kept, sigma-clipped median background) plus the pure-numpy TAN-SIP WCS,
bilinear resampling and sigma-clipped-mean stacking.

Array convention inside this module: FITS order, row 0 = south, column 0 = east (grid WCS has
cdelt1 < 0). Only the encoders flip rows for display.
AI-assisted code (Claude Code).
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass

import numpy as np
from .fitsread import read_hdus
from .tanwcs import TanWCS

SCALE_ARCSEC = 3.075      # grid pixel; the native detector pixel is 6.15"
GAP_DAYS = 10.0
MAX_SPAN_DAYS = 30.0
DEFAULT_CLIP = True       # see README, "Clipping": validated on the two variable stars

BAD_BITS = {"TRANSIENT", "NONFUNC", "MISSING_DATA", "HOT", "COLD", "PHANMISS", "PERSIST",
            "OUTLIER", "STREAK", "SNOWBALL"}
SATURATION_BITS = {"OVERFLOW", "SUR_ERROR", "BLOOM"}   # never masked: they mark bright star cores
INFO_BITS = {"FULLSAMPLE", "SOURCE"}                   # informational, do not count for flag_share
# Bit numbers measured on 14 Nov; used for names a header does not define (no MSKN* keyword).
DEFAULT_BITS = {"TRANSIENT": 0, "OVERFLOW": 1, "SUR_ERROR": 2, "NONFUNC": 6, "MISSING_DATA": 9,
                "HOT": 10, "COLD": 11, "FULLSAMPLE": 12, "PHANMISS": 14, "PERSIST": 17,
                "OUTLIER": 19, "SOURCE": 21, "STREAK": 25, "BLOOM": 26, "SNOWBALL": 27}


# ---------- grid ----------

def make_grid(ra, dec, fov_deg, scale_arcsec=SCALE_ARCSEC, odd=True):
    """North-up, east-left tangent grid centred on (ra, dec): returns (TanWCS, n).

    n = round(fov*3600/scale); with odd=True an even n is raised by one so that the centre is a
    pixel centre. The centre pixel is (n - 1) / 2 in 0-based coordinates.
    """
    n = int(round(fov_deg * 3600.0 / scale_arcsec))
    if odd and n % 2 == 0:
        n += 1
    s = scale_arcsec / 3600.0
    return TanWCS((ra, dec), ((n + 1) / 2, (n + 1) / 2), [[-s, 0.0], [0.0, s]]), n


def grid_world(wcs, n):
    """RA/Dec (degrees) of every pixel centre of an n x n grid."""
    yy, xx = np.mgrid[0:n, 0:n]
    return wcs.pix2world(xx, yy)


# ---------- one cutout ----------

@dataclass
class Cutout:
    image: np.ndarray        # background-subtracted, NaN where masked (float64)
    flagged: np.ndarray      # bool: any non-informational flag, or a non-finite value
    wcs: TanWCS
    masked_fraction: float   # share of NaN pixels in `image`


def _bit_numbers(header):
    """Bit numbers by name: DEFAULT_BITS, overridden by the header's MSKN* keywords."""
    bits = dict(DEFAULT_BITS)
    for key in header.keys():
        if key.startswith("MSKN") and key[4:].isdigit():
            bits[str(header[key]).strip().upper()] = int(key[4:])
    return bits


def _mask_bits(names, bits):
    value = 0
    for name in names:
        if name in bits:
            value |= 1 << bits[name]
    return value


def clipped_median(values, sigma=3.0, maxiters=5):
    """Median after iterative sigma clipping about the median (same recipe as astropy's
    sigma_clipped_stats: std as spread, 5 iterations)."""
    values = values[np.isfinite(values)]
    for _ in range(maxiters):
        if values.size < 3:
            break
        med, std = np.median(values), values.std()
        keep = np.abs(values - med) <= sigma * std
        if keep.all() or not keep.any():
            break
        values = values[keep]
    return float(np.median(values))


def load_cutout(path):
    """Read one cached cutout. Raises OSError / KeyError / ValueError if it cannot be used."""
    hdus = read_hdus(path, ("IMAGE", "ZODI", "FLAGS"))
    image_header, image = hdus["IMAGE"]
    image = image.astype(np.float64) - hdus["ZODI"][1].astype(np.float64)
    flag_header, flags = hdus["FLAGS"]
    flags = flags.astype(np.int64)
    bits = _bit_numbers(flag_header)
    wcs = TanWCS.from_header(image_header)
    bad = (flags & _mask_bits(BAD_BITS, bits)) != 0
    saturated = (flags & _mask_bits(SATURATION_BITS, bits)) != 0
    nonfinite = ~np.isfinite(image)
    mask = (bad & ~saturated) | nonfinite
    image[mask] = np.nan
    finite = image[np.isfinite(image)]
    if finite.size > 10:
        image -= clipped_median(finite)
    flagged = ((flags & ~_mask_bits(INFO_BITS, bits)) != 0) | nonfinite
    return Cutout(image, flagged, wcs, float(mask.mean()))


# ---------- resampling ----------

def bilinear(image, x, y):
    """Bilinear sample of `image` at 0-based pixel coordinates (x = column, y = row).

    NaN is returned outside [0, n-1] and wherever any of the 4 neighbouring pixels is NaN
    (so a masked pixel grows to a 2 x 2 hole; this is accepted, see README). Same result as
    scipy.ndimage.map_coordinates(order=1, mode="constant", cval=nan) on NaN-free input.
    """
    ny, nx = image.shape
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    inside = (x >= 0) & (x <= nx - 1) & (y >= 0) & (y <= ny - 1)
    xs = np.where(inside, x, 0.0)
    ys = np.where(inside, y, 0.0)
    x0 = np.minimum(np.floor(xs).astype(int), nx - 2)
    y0 = np.minimum(np.floor(ys).astype(int), ny - 2)
    fx = xs - x0
    fy = ys - y0
    top = (1 - fx) * image[y0, x0] + fx * image[y0, x0 + 1]
    bottom = (1 - fx) * image[y0 + 1, x0] + fx * image[y0 + 1, x0 + 1]
    out = (1 - fy) * top + fy * bottom
    out[~inside] = np.nan
    return out


def nearest(values, x, y):
    """Nearest-pixel sample; returns (samples, inside). Used for flags, which must stay discrete."""
    ny, nx = values.shape
    xi = np.rint(np.asarray(x, dtype=float))
    yi = np.rint(np.asarray(y, dtype=float))
    inside = (xi >= 0) & (xi <= nx - 1) & (yi >= 0) & (yi <= ny - 1)
    xi = np.where(inside, xi, 0).astype(int)
    yi = np.where(inside, yi, 0).astype(int)
    return np.where(inside, values[yi, xi], False), inside


def _coarse_axis(n, step):
    """Coarse sample indices (always including the last) and, for every index 0..n-1, the lower
    coarse neighbour and the interpolation weight."""
    idx = np.unique(np.append(np.arange(0, n, step), n - 1))
    pos = np.arange(n)
    lo = np.minimum(np.searchsorted(idx, pos, side="right") - 1, len(idx) - 2)
    weight = (pos - idx[lo]) / (idx[lo + 1] - idx[lo])
    return idx, lo, weight


def world2pix_grid(wcs, ra, dec, step=4):
    """wcs.world2pix for 2-D position maps, computed on every `step`-th pixel and interpolated.

    The SIP inversion dominates the run time and the maps are smooth (a tangent projection plus a
    small distortion), so this is accurate to far below 0.01 pixel (checked in the tests).
    """
    ny, nx = ra.shape
    rows, rlo, rw = _coarse_axis(ny, step)
    cols, clo, cw = _coarse_axis(nx, step)
    cx, cy = wcs.world2pix(ra[np.ix_(rows, cols)], dec[np.ix_(rows, cols)])

    def expand(coarse):
        top = (1 - cw) * coarse[rlo][:, clo] + cw * coarse[rlo][:, clo + 1]
        bottom = (1 - cw) * coarse[rlo + 1][:, clo] + cw * coarse[rlo + 1][:, clo + 1]
        return (1 - rw)[:, None] * top + rw[:, None] * bottom

    return expand(cx), expand(cy)


def resample_cutout(cutout, grid_ra, grid_dec, shift=None):
    """Put a cutout on the common grid: returns (image float32, flagged bool, covered bool).

    `shift` = (d_ra_deg, d_dec_deg) is added to the grid positions before sampling (shift-and-add).
    """
    ra, dec = grid_ra, grid_dec
    if shift is not None:
        ra, dec = grid_ra + shift[0], grid_dec + shift[1]
    x, y = world2pix_grid(cutout.wcs, ra, dec)
    image = bilinear(cutout.image, x, y).astype(np.float32)
    flagged, covered = nearest(cutout.flagged, x, y)
    return image, flagged.astype(bool), covered


def proper_motion_shift(mjd, ra0, dec0, pmra, pmdec, center_epoch):
    """(d_ra_deg, d_dec_deg) where the moving object sits at `mjd`; pmra includes cos(dec), mas/yr.

    Same formula as backend/app/frames.py.
    """
    year = 2000.0 + (mjd - 51544.5) / 365.25
    dt = year - center_epoch
    return (pmra / 3.6e6) * dt / np.cos(np.radians(dec0)), (pmdec / 3.6e6) * dt


# ---------- epochs and stacks ----------

def split_epochs(items, gap_days=GAP_DAYS, max_span_days=MAX_SPAN_DAYS, mjd=lambda r: r["mjd"]):
    """Sort by time and group. A group ends at a gap longer than gap_days, or when it would
    span more than max_span_days (near the ecliptic poles coverage never has a gap)."""
    groups = []
    for item in sorted(items, key=mjd):
        if (groups and mjd(item) - mjd(groups[-1][-1]) <= gap_days
                and mjd(item) - mjd(groups[-1][0]) <= max_span_days):
            groups[-1].append(item)
        else:
            groups.append([item])
    return groups


def _nanmedian0(cube):
    """Median along axis 0 ignoring NaN (all-NaN columns give NaN). Sorting puts NaN last, so the
    middle element(s) of the valid part can be picked directly; this is much faster than
    np.nanmedian(axis=0), which loops in Python over pixels that contain NaN."""
    ordered = np.sort(cube, axis=0)
    valid = np.sum(np.isfinite(cube), axis=0)
    lo = np.maximum(valid - 1, 0) // 2
    hi = valid // 2
    cols = np.arange(cube.shape[1])
    lo_val, hi_val = ordered[lo, cols], ordered[hi, cols]
    return np.where(valid > 0, 0.5 * (lo_val + hi_val), np.nan)


def clipped_mean(cube, sigma=3.0, iters=2):
    """Per-pixel sigma-clipped mean along axis 0, ignoring NaN (clipping by MAD about the median,
    implemented for speed)."""
    shape = cube.shape[1:]
    cube = np.array(cube, dtype=np.float32).reshape(len(cube), -1)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        for _ in range(iters):
            med = _nanmedian0(cube)
            sd = 1.4826 * _nanmedian0(np.abs(cube - med))
            sd[sd == 0] = np.inf
            cube[np.abs(cube - med) > sigma * sd] = np.nan
        return np.nanmean(cube, axis=0, dtype=np.float64).reshape(shape)


def stack_images(arrays, clip=DEFAULT_CLIP):
    """Combine equally shaped 2-D arrays (NaN = no data).

    clip=True: sigma-clipped mean (3 sigma by MAD, 2 passes) when there are 3 or more frames.
    With 1-2 frames, or clip=False, a plain NaN-aware mean. Pixels without any valid value stay NaN.
    """
    cube = np.asarray(arrays, dtype=np.float64)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN pixels stay NaN
        plain = np.nanmean(cube, axis=0)
        if not clip or len(cube) < 3:
            return plain
        clipped = clipped_mean(cube)
    return np.where(np.isfinite(clipped), clipped, plain)  # clipping never turns data into holes


def flag_share(flagged, covered):
    """uint8 0-255: share of the covering exposures in which each pixel is flagged."""
    total = np.sum(covered, axis=0)
    bad = np.sum(np.asarray(flagged) & np.asarray(covered), axis=0)
    share = bad / np.maximum(total, 1)
    return np.rint(255 * share).astype(np.uint8)


def noise_estimate(image, exclude_radius_frac=0.25):
    """Robust 1-sigma sky noise: MAD of finite pixels outside the central region.

    The centre (radius = 0.25 * size) is ignored because the target and bright stars sit there.
    Returns NaN if fewer than 10 usable pixels remain.
    """
    ny, nx = image.shape
    yy, xx = np.indices(image.shape)
    r = np.hypot(xx - (nx - 1) / 2, yy - (ny - 1) / 2)
    values = image[(r > exclude_radius_frac * max(nx, ny)) & np.isfinite(image)]
    if values.size < 10:
        return float("nan")
    return float(1.4826 * np.median(np.abs(values - np.median(values))))
