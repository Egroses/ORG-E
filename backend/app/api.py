"""Real (non-mock) endpoints."""

from fastapi import APIRouter, Query

from .models import ResolveResponse, Target
from .resolve import resolve as resolve_text
from .targets import TARGETS

router = APIRouter(prefix="/api")


@router.get("/targets", response_model=list[Target])
def get_targets():
    return TARGETS


@router.get("/resolve", response_model=ResolveResponse)
def resolve(q: str = Query(..., description="object name or coordinates")):
    return resolve_text(q)
