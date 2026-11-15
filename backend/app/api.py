"""Targets, name resolving and analysis endpoints."""

from typing import Literal, Optional, Union

from fastapi import APIRouter, Query

from .errors import ApiError
from .gaia import gaia_sources
from .models import ChannelSpectrum, GaiaSource, ResolveResponse, SkyPosition, SpectrumPoint, Target
from .photometry import APERTURE_PX, APERTURE_RANGE, channel_spectrum, photometry
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


def _check_aperture(aperture):
    if not APERTURE_RANGE[0] <= aperture <= APERTURE_RANGE[1]:
        raise ApiError("bad_input", f"aperture must be {APERTURE_RANGE[0]:g}-{APERTURE_RANGE[1]:g} detector pixels.")


@router.get("/spectrum", response_model=Union[list[SpectrumPoint], ChannelSpectrum])
def spectrum(ra: float, dec: float,
             pmra: Optional[float] = Query(None, description="mas/yr; follows a moving source"),
             pmdec: Optional[float] = Query(None, description="mas/yr"),
             aperture: float = Query(APERTURE_PX, description="aperture radius in detector pixels (6.15 arcsec), 1-3"),
             mode: Optional[Literal["102"]] = Query(None, description="102: median per channel, 6 detectors x 17")):
    """One point per cached cutout (all detectors), sorted by wavelength; with mode=102, 102 channels.

    ra/dec are at epoch 2026.0; with pmra/pmdec the aperture follows the source.
    """
    _check_position(ra, dec)
    _check_aperture(aperture)
    points = photometry(ra, dec, pmra, pmdec, aperture_px=aperture)
    if not points:
        raise ApiError("no_coverage", _NO_DATA)
    if mode == "102":
        channels = channel_spectrum(points)
        warnings = []
        if any(c["saturated"] for c in channels):
            warnings.append("The source is saturated in some channels: their fluxes are lower limits.")
        if any(c["flux_mjy"] is None for c in channels):
            warnings.append("Some channels have no usable exposure (flux null).")
        return ChannelSpectrum(center=SkyPosition(ra=ra, dec=dec), aperture_px=aperture, channels=channels,
                               warnings=warnings)
    return sorted(points, key=lambda p: (p["wavelength_um"], p["mjd"]))


@router.get("/lightcurve", response_model=list[SpectrumPoint])
def lightcurve(ra: float, dec: float, detector: int = Query(6, ge=1, le=6),
               pmra: Optional[float] = None, pmdec: Optional[float] = None,
               wl_min: Optional[float] = Query(None, description="micron; keep a narrow band"),
               wl_max: Optional[float] = Query(None, description="micron"),
               aperture: float = Query(APERTURE_PX, description="aperture radius in detector pixels, 1-3")):
    """Brightness over time in one detector, sorted by date.

    Each exposure sees the source at a different wavelength; pass wl_min/wl_max to compare
    a narrow band only.
    """
    _check_position(ra, dec)
    _check_aperture(aperture)
    points = [p for p in photometry(ra, dec, pmra, pmdec, detector=detector, aperture_px=aperture)
              if (wl_min is None or p["wavelength_um"] >= wl_min)
              and (wl_max is None or p["wavelength_um"] <= wl_max)]
    if not points:
        raise ApiError("no_coverage", _NO_DATA)
    return sorted(points, key=lambda p: p["mjd"])
