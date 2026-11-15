"""Gaia DR3 sources around a position, moved from epoch 2016.0 to the frame epoch (2026.0).

The fields of the five test targets are answered from small CSV files kept in the repository
(`app/gaia_fields/<target>.csv`, written by `scripts/gaia_fields.py`), so they work when no Gaia
archive answers. Other positions are queried live: the ESA archive first, then the GAVO Data
Center mirror in Heidelberg (same DR3 values) when ESA does not answer.
"""

import csv
import io
import math
from functools import lru_cache
from pathlib import Path

import requests

from . import config
from .errors import ApiError
from .models import GaiaSource
from .targets import TARGETS

GAIA_EPOCH = 2016.0
TIMEOUT = (8, 30)  # seconds: connect, read
SERVICES = [  # (name, TAP sync URL, table); tried in this order
    ("ESA", "https://gea.esac.esa.int/tap-server/tap/sync", "gaiadr3.gaia_source"),
    ("GAVO", "https://dc.zah.uni-heidelberg.de/tap/sync", "gaia.dr3lite"),
]
COLUMNS = ["source_id", "ra", "dec", "phot_g_mean_mag", "pmra", "pmdec", "pmra_error", "pmdec_error"]

# Stored target fields: every source brighter than FIELD_GMAG within FIELD_RADIUS of the target.
FIELDS_DIR = Path(__file__).parent / "gaia_fields"
FIELD_RADIUS = 0.22  # deg; the frontend's largest request (0.25 deg field: radius 0.1875) + MOTION_MARGIN
# Catalogue positions are years old: a source is searched MOTION_MARGIN further out, moved to 2026.0,
# and then cut to the requested circle, so fast movers (Barnard's Star ~10"/yr, WISE 0855 ~8"/yr) are kept.
MOTION_MARGIN = 0.03  # deg, ~108 arcsec
FIELD_GMAG = 19.0
FIELD_LIMIT = 50000  # far above any field's count, so a stored field is complete


def _float_or_none(value):
    return float(value) if value not in ("", None) else None


def propagate(ra, dec, pmra, pmdec, years):
    """Linear proper-motion step (enough for 10 years; parallax is ignored)."""
    if pmra is None or pmdec is None:
        return ra, dec
    new_dec = dec + pmdec * years / 3.6e6
    new_ra = ra + pmra * years / 3.6e6 / max(math.cos(math.radians(dec)), 1e-6)
    return new_ra % 360, new_dec


def pm_snr(pmra, pmdec, pmra_error, pmdec_error):
    """Proper motion over its error, hypot(pmra/err, pmdec/err); None when anything is unknown or zero."""
    if None in (pmra, pmdec, pmra_error, pmdec_error) or pmra_error <= 0 or pmdec_error <= 0:
        return None
    return round(math.hypot(pmra / pmra_error, pmdec / pmdec_error), 2)


def separation_deg(ra1, dec1, ra2, dec2):
    d1, d2 = math.radians(dec1), math.radians(dec2)
    cos = (math.sin(d1) * math.sin(d2)
           + math.cos(d1) * math.cos(d2) * math.cos(math.radians(ra1 - ra2)))
    return math.degrees(math.acos(max(-1.0, min(1.0, cos))))


def query_services(ra, dec, radius, gmag_max, limit):
    """Gaia DR3 rows (epoch 2016.0) from the first service that answers; raises the last error."""
    error = None
    for name, url, table in SERVICES:
        adql = (
            f"SELECT TOP {limit} {', '.join(COLUMNS)} FROM {table} "
            f"WHERE 1 = CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', {ra}, {dec}, {radius})) "
            f"AND phot_g_mean_mag < {gmag_max} ORDER BY phot_g_mean_mag"
        )
        try:
            response = requests.get(url, timeout=TIMEOUT, params={
                "REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": adql})
            response.raise_for_status()
        except requests.RequestException as exc:
            error = requests.RequestException(f"{name}: {exc}")
            continue
        rows = tuple(csv.DictReader(io.StringIO(response.text)))
        if rows and set(COLUMNS[:6]) - set(rows[0]):  # the error columns are optional
            error = requests.RequestException(f"{name}: unexpected columns {sorted(rows[0])}")
            continue
        return rows
    raise error


@lru_cache(maxsize=256)
def _query(ra, dec, radius, gmag_max, limit):
    return query_services(ra, dec, radius, gmag_max, limit)


@lru_cache(maxsize=None)
def _field_rows(key):
    path = FIELDS_DIR / f"{key}.csv"
    if not path.exists():
        return None
    with open(path, encoding="utf-8", newline="") as handle:
        return tuple(csv.DictReader(handle))


def _from_fields(ra, dec, radius, gmag_max):
    """Rows within `radius` (catalogue epoch) from a stored target field containing the circle, else None."""
    if gmag_max > FIELD_GMAG:
        return None
    for target in TARGETS:
        if separation_deg(ra, dec, target.ra, target.dec) + radius > FIELD_RADIUS:
            continue
        rows = _field_rows(target.key)
        if rows is None:
            continue
        return [row for row in rows
                if float(row["phot_g_mean_mag"] or 99) < gmag_max
                and separation_deg(ra, dec, float(row["ra"]), float(row["dec"])) <= radius]
    return None


def gaia_sources(ra, dec, radius=0.075, gmag_max=19.0, limit=500, epoch=config.CENTER_EPOCH):
    if not (0 <= ra < 360 and -90 <= dec <= 90):
        raise ApiError("bad_input", "RA must be 0-360 and Dec -90..+90 degrees.")
    if not 0 < radius <= 0.5:
        raise ApiError("bad_input", "radius must be between 0 and 0.5 degrees.")
    limit = max(1, min(int(limit), 2000))
    search = radius + MOTION_MARGIN
    rows = _from_fields(ra, dec, search, float(gmag_max))
    if rows is None:
        try:
            rows = _query(round(ra, 5), round(dec, 5), round(search, 4), float(gmag_max), 2000)
        except requests.RequestException as exc:
            raise ApiError("archive_unavailable", f"No Gaia archive answered: {exc}")
    sources = []
    for row in rows:
        pmra, pmdec = _float_or_none(row["pmra"]), _float_or_none(row["pmdec"])
        new_ra, new_dec = propagate(float(row["ra"]), float(row["dec"]), pmra, pmdec, epoch - GAIA_EPOCH)
        if separation_deg(ra, dec, new_ra, new_dec) > radius:
            continue
        snr = pm_snr(pmra, pmdec, _float_or_none(row.get("pmra_error")), _float_or_none(row.get("pmdec_error")))
        sources.append(GaiaSource(
            source_id=row["source_id"], ra=round(new_ra, 7), dec=round(new_dec, 7),
            gmag=_float_or_none(row["phot_g_mean_mag"]), pmra=pmra, pmdec=pmdec, pm_snr=snr))
    sources.sort(key=lambda source: 99 if source.gmag is None else source.gmag)
    return sources[:limit]
