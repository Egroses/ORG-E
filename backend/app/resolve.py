"""Turn user text (coordinates or an object name) into a 2026.0 sky position.

Order: coordinates (degrees or sexagesimal) -> the five test targets -> SIMBAD
(Harvard mirror first, then the main CDS server; the main server returned 404 on 14 Nov).
"""

import csv
import io
import re
from functools import lru_cache

import astropy.units as u
import requests
from astropy.coordinates import Distance, SkyCoord
from astropy.time import Time

from .errors import ApiError
from .models import EpochPosition, ResolveResponse
from .targets import CATALOG, TARGETS_BY_KEY

CURRENT_EPOCH = 2026.0
CATALOG_EPOCH = 2000.0  # SIMBAD basic.ra/dec are ICRS at epoch J2000

SIMBAD_TAP = [
    "https://simbad.harvard.edu/simbad/sim-tap/sync",
    "https://simbad.cds.unistra.fr/simbad/sim-tap/sync",
]
SIMBAD_TIMEOUT = 8  # seconds per server

_DECIMAL = re.compile(r"^\s*([+-]?\d+(?:\.\d*)?)\s*(?:,\s*|\s+)([+-]?\d+(?:\.\d*)?)\s*$")
_NUMBER = re.compile(r"\d+(?:\.\d*)?")
_COORD_CHARS = re.compile(r"^[\d\s.+\-:,hmsd°'\"″′]+$", re.IGNORECASE)


# ---------- coordinates ----------

def looks_like_coordinates(text: str) -> bool:
    """Only digits, separators and h/m/s/d markers, with at least two numbers."""
    return bool(_COORD_CHARS.match(text)) and len(_NUMBER.findall(text)) >= 2


def parse_coordinates(text: str):
    """Return (ra, dec) in degrees or raise ApiError(bad_input)."""
    match = _DECIMAL.match(text)
    try:
        if match:
            ra, dec = float(match.group(1)), float(match.group(2))
        else:
            coord = SkyCoord(text.replace(",", " "), unit=(u.hourangle, u.deg), frame="icrs")
            ra, dec = coord.ra.deg, coord.dec.deg
    except ValueError:
        raise ApiError("bad_input", f"Could not read coordinates from '{text}'.")
    if not (0 <= ra < 360 and -90 <= dec <= 90):
        raise ApiError("bad_input", "RA must be 0-360 and Dec -90..+90 degrees.")
    return ra, dec


# ---------- proper motion ----------

def propagate(ra, dec, pmra, pmdec, parallax, from_epoch, to_epoch):
    """Move a position with its proper motion. Returns (ra, dec) in degrees."""
    if pmra is None or pmdec is None:
        return ra, dec
    distance = Distance(parallax=parallax * u.mas) if parallax and parallax > 0 else 10 * u.kpc
    coord = SkyCoord(ra=ra * u.deg, dec=dec * u.deg, distance=distance,
                     pm_ra_cosdec=pmra * u.mas / u.yr, pm_dec=pmdec * u.mas / u.yr,
                     obstime=Time(from_epoch, format="jyear"), frame="icrs")
    moved = coord.apply_space_motion(new_obstime=Time(to_epoch, format="jyear"))
    return moved.ra.deg % 360, moved.dec.deg


# ---------- names ----------

def normalize_name(text: str) -> str:
    text = text.lower().replace("'", "").replace("’", "").replace("_", " ")
    return " ".join(text.split())


_ALIASES = {alias: key for key, entry in CATALOG.items() for alias in entry["aliases"]}


class SimbadUnavailable(Exception):
    pass


def _float_or_none(value):
    return float(value) if value not in ("", None) else None


def _query_simbad(server: str, name: str):
    adql = ("SELECT TOP 1 b.main_id, b.ra, b.dec, b.pmra, b.pmdec, b.plx_value "
            "FROM basic AS b JOIN ident AS i ON i.oidref = b.oid "
            f"WHERE i.id = '{name.replace(chr(39), chr(39) * 2)}'")
    response = requests.get(server, timeout=SIMBAD_TIMEOUT, params={
        "REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": adql})
    response.raise_for_status()
    if not response.headers.get("content-type", "").startswith("text/csv"):
        raise SimbadUnavailable(f"{server} returned {response.headers.get('content-type')}")
    rows = list(csv.DictReader(io.StringIO(response.text)))
    if not rows:
        return None
    row = rows[0]
    if row["ra"] in ("", None):
        return None
    return {
        "name": row["main_id"],
        "ra": float(row["ra"]),
        "dec": float(row["dec"]),
        "pmra": _float_or_none(row["pmra"]),
        "pmdec": _float_or_none(row["pmdec"]),
        "parallax": _float_or_none(row["plx_value"]),
    }


@lru_cache(maxsize=1024)
def lookup_simbad(name: str):
    """SIMBAD record for a name, None if unknown. Raises SimbadUnavailable if no server answers."""
    errors = []
    for server in SIMBAD_TAP:
        try:
            return _query_simbad(server, name)
        except (requests.RequestException, SimbadUnavailable, KeyError, ValueError) as exc:
            errors.append(f"{server}: {exc}")
    raise SimbadUnavailable("; ".join(errors))


# ---------- entry point ----------

def _response(query, name, ra, dec, pmra, pmdec, parallax, source) -> ResolveResponse:
    now_ra, now_dec = propagate(ra, dec, pmra, pmdec, parallax, CATALOG_EPOCH, CURRENT_EPOCH)
    return ResolveResponse(
        query=query,
        name=name,
        catalog=EpochPosition(ra=round(ra, 6), dec=round(dec, 6), epoch=CATALOG_EPOCH),
        current=EpochPosition(ra=round(now_ra, 6), dec=round(now_dec, 6), epoch=CURRENT_EPOCH),
        pmra=pmra, pmdec=pmdec, parallax=parallax, source=source,
    )


def resolve(query: str) -> ResolveResponse:
    text = query.strip()
    if not text:
        raise ApiError("bad_input", "Enter a name or coordinates.")

    if looks_like_coordinates(text):
        ra, dec = parse_coordinates(text)
        position = EpochPosition(ra=round(ra, 6), dec=round(dec, 6), epoch=CURRENT_EPOCH)
        return ResolveResponse(query=query, catalog=position, current=position, source="coordinates")

    key = _ALIASES.get(normalize_name(text))
    if key:
        entry, target = CATALOG[key], TARGETS_BY_KEY[key]
        return ResolveResponse(
            query=query, name=target.name,
            catalog=EpochPosition(ra=entry["ra_j2000"], dec=entry["dec_j2000"], epoch=CATALOG_EPOCH),
            current=EpochPosition(ra=target.ra, dec=target.dec, epoch=CURRENT_EPOCH),
            pmra=entry["pmra"], pmdec=entry["pmdec"], parallax=entry["parallax"], source="targets",
        )

    try:
        record = lookup_simbad(" ".join(text.split()))
    except SimbadUnavailable:
        raise ApiError("archive_unavailable",
                       "The name resolver (SIMBAD) is not responding. Try coordinates instead.")
    if record is None:
        raise ApiError("not_found", f"No object named '{text}' was found.")
    return _response(query, record["name"], record["ra"], record["dec"],
                     record["pmra"], record["pmdec"], record["parallax"], "simbad")
