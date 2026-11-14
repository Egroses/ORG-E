"""Gaia DR3 sources around a position, moved from epoch 2016.0 to the frame epoch (2026.0)."""

import csv
import io
import math
from functools import lru_cache

import requests

from . import config
from .errors import ApiError
from .models import GaiaSource

GAIA_TAP = "https://gea.esac.esa.int/tap-server/tap/sync"
GAIA_EPOCH = 2016.0
TIMEOUT = 30  # seconds


def _float_or_none(value):
    return float(value) if value not in ("", None) else None


def propagate(ra, dec, pmra, pmdec, years):
    """Linear proper-motion step (enough for 10 years; parallax is ignored)."""
    if pmra is None or pmdec is None:
        return ra, dec
    new_dec = dec + pmdec * years / 3.6e6
    new_ra = ra + pmra * years / 3.6e6 / max(math.cos(math.radians(dec)), 1e-6)
    return new_ra % 360, new_dec


@lru_cache(maxsize=256)
def _query(ra, dec, radius, gmag_max, limit):
    adql = (
        f"SELECT TOP {limit} source_id, ra, dec, phot_g_mean_mag, pmra, pmdec "
        "FROM gaiadr3.gaia_source "
        f"WHERE 1 = CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', {ra}, {dec}, {radius})) "
        f"AND phot_g_mean_mag < {gmag_max} ORDER BY phot_g_mean_mag"
    )
    response = requests.get(GAIA_TAP, timeout=TIMEOUT, params={
        "REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": adql})
    response.raise_for_status()
    return tuple(csv.DictReader(io.StringIO(response.text)))


def gaia_sources(ra, dec, radius=0.075, gmag_max=19.0, limit=500, epoch=config.CENTER_EPOCH):
    if not (0 <= ra < 360 and -90 <= dec <= 90):
        raise ApiError("bad_input", "RA must be 0-360 and Dec -90..+90 degrees.")
    if not 0 < radius <= 0.5:
        raise ApiError("bad_input", "radius must be between 0 and 0.5 degrees.")
    limit = max(1, min(int(limit), 2000))
    try:
        rows = _query(round(ra, 5), round(dec, 5), round(radius, 4), float(gmag_max), limit)
    except requests.RequestException as exc:
        raise ApiError("archive_unavailable", f"The Gaia archive did not answer: {exc}")
    sources = []
    for row in rows:
        pmra, pmdec = _float_or_none(row["pmra"]), _float_or_none(row["pmdec"])
        new_ra, new_dec = propagate(float(row["ra"]), float(row["dec"]), pmra, pmdec, epoch - GAIA_EPOCH)
        sources.append(GaiaSource(
            source_id=row["source_id"], ra=round(new_ra, 7), dec=round(new_dec, 7),
            gmag=_float_or_none(row["phot_g_mean_mag"]), pmra=pmra, pmdec=pmdec))
    return sources
