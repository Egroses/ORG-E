"""Targets, name resolving and analysis endpoints."""

from typing import Optional

from fastapi import APIRouter, Query

from .errors import ApiError
from .gaia import gaia_sources
from .models import GaiaSource, ResolveResponse, SpectrumPoint, Target
from .photometry import photometry
from .resolve import resolve as resolve_text
from .targets import TARGETS

router = APIRouter(prefix="/api")

_NO_DATA = ("No cached SPHEREx images cover this position yet. "
            "Open its frames first; the spectrum uses the same images.")


def _check_position(ra, dec):
    if not (0 <= ra < 360 and -90 <= dec <= 90):
        raise ApiError("bad_input", "RA must be 0-360 and Dec -90..+90 degrees.")


@router.get("/targets", response_model=list[Target])
def get_targets():
    return TARGETS


@router.get("/resolve", response_model=ResolveResponse)
def resolve(q: str = Query(..., description="object name or coordinates")):
    return resolve_text(q)


@router.get("/gaia", response_model=list[GaiaSource])
def gaia(ra: float, dec: float,
         radius: float = Query(0.075, description="degrees; 0.075 covers the corners of a 0.1 deg frame"),
         gmag_max: float = Query(19.0, description="faintest Gaia G magnitude"),
         limit: int = Query(500, description="at most this many sources, brightest first")):
    """Gaia DR3 sources, positions moved to epoch 2026.0 with their proper motion."""
    return gaia_sources(ra, dec, radius, gmag_max, limit)


@router.get("/spectrum", response_model=list[SpectrumPoint])
def spectrum(ra: float, dec: float,
             pmra: Optional[float] = Query(None, description="mas/yr; follows a moving source"),
             pmdec: Optional[float] = Query(None, description="mas/yr")):
    """One point per cached cutout (all detectors), sorted by wavelength.

    ra/dec are at epoch 2026.0; with pmra/pmdec the aperture follows the source.
    """
    _check_position(ra, dec)
    points = photometry(ra, dec, pmra, pmdec)
    if not points:
        raise ApiError("no_coverage", _NO_DATA)
    return sorted(points, key=lambda p: (p["wavelength_um"], p["mjd"]))


@router.get("/lightcurve", response_model=list[SpectrumPoint])
def lightcurve(ra: float, dec: float, detector: int = Query(6, ge=1, le=6),
               pmra: Optional[float] = None, pmdec: Optional[float] = None,
               wl_min: Optional[float] = Query(None, description="micron; keep a narrow band"),
               wl_max: Optional[float] = Query(None, description="micron")):
    """Brightness over time in one detector, sorted by date.

    Each exposure sees the source at a different wavelength; pass wl_min/wl_max to compare
    a narrow band only.
    """
    _check_position(ra, dec)
    points = [p for p in photometry(ra, dec, pmra, pmdec, detector=detector)
              if (wl_min is None or p["wavelength_um"] >= wl_min)
              and (wl_max is None or p["wavelength_um"] <= wl_max)]
    if not points:
        raise ApiError("no_coverage", _NO_DATA)
    return sorted(points, key=lambda p: p["mjd"])
