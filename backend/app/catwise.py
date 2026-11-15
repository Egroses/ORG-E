"""CatWISE2020 sources around a position (WISE 3.4 and 4.6 micron), moved to epoch 2026.0.

CatWISE2020 measures motions from ten years of WISE/NEOWISE images, so it sees cold, red objects
that are too faint for Gaia (WISE 0855 is one). Positions `ra_pm`/`dec_pm` are at MJD 57170
(2015.405); `pmra`/`pmdec` are in arcsec/yr (pmra includes cos(dec)) and are given here in mas/yr.

The fields of the five test targets come from `app/catwise_fields/<target>.csv`
(`scripts/catwise_fields.py`). Other positions are queried live: IRSA first, then the copy at
NOIRLab Astro Data Lab when IRSA does not answer (IRSA's TAP gave 502 errors on 15 Nov).
A box query is used (both services understand it) and trimmed to the circle here.
"""

import csv
import io
import math
from functools import lru_cache
from pathlib import Path

import requests

from . import config
from .errors import ApiError
from .gaia import MOTION_MARGIN, propagate, separation_deg
from .models import CatwiseSource
from .targets import TARGETS

CATWISE_EPOCH = 2015.405  # MJD 57170
TIMEOUT = (8, 120)  # seconds: connect, read (Data Lab takes 5-40 s)
BOX_MARGIN = 0.01   # deg: the indexed ra/dec (mean epoch) differ from ra_pm/dec_pm by at most ~10 arcsec
SERVICES = [  # (name, TAP sync URL, table)
    ("IRSA", "https://irsa.ipac.caltech.edu/TAP/sync", "catwise_2020"),
    ("DataLab", "https://datalab.noirlab.edu/tap/sync", "catwise2020.main"),
]
COLUMNS = ["source_name", "ra_pm", "dec_pm", "w1mpro", "w2mpro", "pmra", "pmdec", "sigpmra", "sigpmdec"]

FIELDS_DIR = Path(__file__).parent / "catwise_fields"
FIELD_RADIUS = 0.22  # deg, as for Gaia: largest frontend request + MOTION_MARGIN
FIELD_LIMIT = 50000
MAX_RADIUS = 0.25


def _float_or_none(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _box(ra, dec, radius):
    """ADQL condition on the indexed ra/dec for a box around the circle (RA wrap handled)."""
    radius = radius + BOX_MARGIN
    dra = radius / max(math.cos(math.radians(min(abs(dec) + radius, 89.9))), 1e-6)
    lo, hi = ra - dra, ra + dra
    dec_cond = f"dec BETWEEN {dec - radius} AND {dec + radius}"
    if dra >= 180:
        return dec_cond
    if lo < 0:
        ra_cond = f"(ra >= {lo + 360} OR ra <= {hi})"
    elif hi >= 360:
        ra_cond = f"(ra >= {lo} OR ra <= {hi - 360})"
    else:
        ra_cond = f"ra BETWEEN {lo} AND {hi}"
    return f"{dec_cond} AND {ra_cond}"


def query_services(ra, dec, radius, limit):
    """CatWISE rows (epoch 2015.405) within the circle, from the first service that answers."""
    error = None
    for name, url, table in SERVICES:
        adql = f"SELECT TOP {limit} {', '.join(COLUMNS)} FROM {table} WHERE {_box(ra, dec, radius)} ORDER BY w2mpro"
        try:
            response = requests.get(url, timeout=TIMEOUT, params={
                "REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": adql})
            response.raise_for_status()
        except requests.RequestException as exc:
            error = requests.RequestException(f"{name}: {exc}")
            continue
        rows = list(csv.DictReader(io.StringIO(response.text)))
        if rows and set(COLUMNS) - set(rows[0]):  # an error page or a VOTable error message
            error = requests.RequestException(f"{name}: unexpected answer {response.text[:200]!r}")
            continue
        if not rows and not response.text.startswith("source_name"):
            error = requests.RequestException(f"{name}: unexpected answer {response.text[:200]!r}")
            continue
        return tuple(r for r in rows
                     if separation_deg(ra, dec, float(r["ra_pm"]), float(r["dec_pm"])) <= radius)
    raise error


@lru_cache(maxsize=256)
def _query(ra, dec, radius, limit):
    return query_services(ra, dec, radius, limit)


@lru_cache(maxsize=None)
def _field_rows(key):
    path = FIELDS_DIR / f"{key}.csv"
    if not path.exists():
        return None
    with open(path, encoding="utf-8", newline="") as handle:
        return tuple(csv.DictReader(handle))


def _from_fields(ra, dec, radius):
    for target in TARGETS:
        if separation_deg(ra, dec, target.ra, target.dec) + radius > FIELD_RADIUS:
            continue
        rows = _field_rows(target.key)
        if rows is None:
            continue
        return [r for r in rows if separation_deg(ra, dec, float(r["ra_pm"]), float(r["dec_pm"])) <= radius]
    return None


def catwise_sources(ra, dec, radius=0.075, limit=500, epoch=config.CENTER_EPOCH):
    """Sources whose 2026.0 position is within `radius` (searched MOTION_MARGIN further out, see gaia.py)."""
    if not (0 <= ra < 360 and -90 <= dec <= 90):
        raise ApiError("bad_input", "RA must be 0-360 and Dec -90..+90 degrees.")
    if not 0 < radius <= MAX_RADIUS:
        raise ApiError("bad_input", f"radius must be between 0 and {MAX_RADIUS} degrees.")
    limit = max(1, min(int(limit), 2000))
    search = radius + MOTION_MARGIN
    rows = _from_fields(ra, dec, search)
    if rows is None:
        try:
            rows = _query(round(ra, 5), round(dec, 5), round(search, 4), 5000)
        except requests.RequestException as exc:
            raise ApiError("archive_unavailable", f"No CatWISE archive answered: {exc}")
    sources = []
    for row in rows:
        pm = [_float_or_none(row[k]) for k in ("pmra", "pmdec", "sigpmra", "sigpmdec")]
        pmra, pmdec = (None if v is None else round(v * 1000, 2) for v in pm[:2])  # arcsec/yr -> mas/yr
        snr = None
        if None not in pm and pm[2] > 0 and pm[3] > 0:
            snr = round(math.hypot(pm[0] / pm[2], pm[1] / pm[3]), 2)
        new_ra, new_dec = propagate(float(row["ra_pm"]), float(row["dec_pm"]), pmra, pmdec, epoch - CATWISE_EPOCH)
        if separation_deg(ra, dec, new_ra, new_dec) > radius:
            continue
        sources.append(CatwiseSource(
            name=row["source_name"], ra=round(new_ra, 7), dec=round(new_dec, 7),
            w1=_float_or_none(row["w1mpro"]), w2=_float_or_none(row["w2mpro"]),
            pmra=pmra, pmdec=pmdec, pm_snr=snr))
    sources.sort(key=lambda source: 99 if source.w2 is None else source.w2)
    return sources[:limit]
