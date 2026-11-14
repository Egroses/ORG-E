"""Real (non-mock) endpoints."""

from fastapi import APIRouter, Query

from .gaia import gaia_sources
from .models import GaiaSource, ResolveResponse, Target
from .resolve import resolve as resolve_text
from .targets import TARGETS

router = APIRouter(prefix="/api")


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
