"""FastAPI entry point. Run from backend/: uvicorn app.main:app --reload"""

import truststore

truststore.inject_into_ssl()  # use the OS certificate store (Windows TLS errors otherwise)

import logging  # noqa: E402
import threading  # noqa: E402
from contextlib import asynccontextmanager  # noqa: E402
from pathlib import Path  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.middleware.gzip import GZipMiddleware  # noqa: E402
from fastapi.responses import RedirectResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from . import api, config, jobs, patch  # noqa: E402
from .errors import install_error_handlers  # noqa: E402
from .prebuild import submit_all  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("backend")


def _prebuild():
    submit_all(jobs.manager)
    patch.submit_all()
    warm_spectra()  # after the queuing above; runs alongside the builds


def warm_spectra():
    """Load the cached cutouts of the five targets into memory so the first spectrum is fast."""
    from .photometry import photometry
    from .targets import TARGETS
    for t in TARGETS:
        try:
            photometry(t.ra, t.dec)
        except Exception:  # never stop the start-up for this
            log.exception("could not warm the spectrum of %s", t.key)
    log.info("spectrum cutouts of the test targets are in memory")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if config.PREBUILD_ON_START:
        threading.Thread(target=_prebuild, daemon=True).start()
        log.info("queued frame jobs and patches for the cached test targets")
    yield


app = FastAPI(title="Sky Quest API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
# JSON answers (spectra, light curves) shrink about 2x; small answers are left alone.
# /api/patch sends its stored gzip bytes as they are (the middleware skips encoded answers).
app.add_middleware(GZipMiddleware, minimum_size=1000)

install_error_handlers(app)
app.include_router(api.router)
app.include_router(jobs.router)
app.include_router(patch.router)


@app.get("/api/health")
def health():
    cache = config.REPO_ROOT / "cache"
    return {"status": "ok", "frontend": config.FRONTEND_DIST.is_dir(), "live_queries": config.LIVE_QUERIES, "archive_source": config.ARCHIVE_SOURCE,
            # pipeline cache units (target x detector) on disk; 30 = all five test targets, six detectors each
            "cached_units": sum(1 for _ in cache.glob("*/D[1-6]/manifest.csv")),
            "frame_engine": jobs.frame_engine(), "patch": patch.imaging_available(),
            "real": ["targets", "resolve", "jobs", "frames", "diff", "gaia", "spectrum", "lightcurve", "patch"]}


def mount_frontend(application: FastAPI, dist: Path) -> bool:
    """Serve the built frontend at "/" (after the API routes, so /api/* wins)."""
    if not (dist / "index.html").is_file():
        return False
    application.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
    return True


if not mount_frontend(app, config.FRONTEND_DIST):
    @app.get("/", include_in_schema=False)
    def root():
        return RedirectResponse("/docs")
