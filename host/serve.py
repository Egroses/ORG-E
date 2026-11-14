"""One local server for the team backend (backend/) and the SPHEREx Blink viewer (blink/).

Neither application is modified. This file only decides which one answers a request:

  /api/epochs, /api/stack, /api/quality, /api/catalog     -> Blink data API (unchanged)
  /api/spectrum  with pra/pdec (Blink's form)            -> Blink data API
  /api/spectrum  without them (team form: ra, dec, pm)   -> team backend
  every other /api/*, /docs, /openapi.json, /redoc       -> team backend
  /missions                                              -> Blink frontend, missions.html
  everything else (pages, scripts, styles)               -> Blink frontend

Run from the repository root:  python -m uvicorn serve:app --app-dir host --port 8000
AI-assisted code (Claude Code).
"""
from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path
from urllib.parse import parse_qs

ROOT = Path(__file__).resolve().parent.parent
TEAM_BACKEND = ROOT / "backend"
BLINK = ROOT / "blink"

# Team backend: archive downloads off by default; the test targets are read from the pipeline
# cache (cache/ at the repository root). Set LIVE_QUERIES=1 to allow downloads.
os.environ.setdefault("LIVE_QUERIES", "0")
os.environ.setdefault("FRONTEND_DIST", str(ROOT / "host" / "no-frontend-dist"))   # Blink serves the pages

# Team backend is the package "app" inside backend/ (run there as app.main:app).
sys.path.insert(0, str(TEAM_BACKEND))
from app.main import app as team_app  # noqa: E402

# Blink's backend is a module also called "app"; load it under another name so the two do not clash.
sys.path.insert(0, str(BLINK / "backend"))       # for its "spx" package
_spec = importlib.util.spec_from_file_location("blink_app", BLINK / "backend" / "app.py")
blink_module = importlib.util.module_from_spec(_spec)
sys.modules["blink_app"] = blink_module
_spec.loader.exec_module(blink_module)
blink_app = blink_module.app

BLINK_API = ("/api/epochs", "/api/stack", "/api/quality", "/api/catalog")
TEAM_PATHS = ("/api/", "/docs", "/openapi.json", "/redoc")


def _query(scope) -> dict:
    return parse_qs(scope.get("query_string", b"").decode("latin-1"))


def route(scope) -> str:
    path = scope.get("path", "")
    if path in BLINK_API:
        return "blink"
    if path == "/api/spectrum":
        q = _query(scope)
        return "blink" if "pra" in q and "pdec" in q else "team"
    if path.startswith(TEAM_PATHS):
        return "team"
    return "blink"


async def app(scope, receive, send):
    if scope["type"] == "lifespan":           # only the team backend has start-up work
        await team_app(scope, receive, send)
        return
    if scope["type"] == "http" and scope.get("path") in ("/missions", "/missions/"):
        scope = dict(scope, path="/missions.html", raw_path=b"/missions.html")
    target = team_app if route(scope) == "team" else blink_app
    await target(scope, receive, send)
