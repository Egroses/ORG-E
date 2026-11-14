"""FastAPI entry point. Run from backend/: uvicorn app.main:app --reload"""

import truststore

truststore.inject_into_ssl()  # use the OS certificate store (Windows TLS errors otherwise)

import logging  # noqa: E402
import threading  # noqa: E402
from contextlib import asynccontextmanager  # noqa: E402
from pathlib import Path  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import RedirectResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from . import api, config, jobs  # noqa: E402
from .errors import install_error_handlers  # noqa: E402
from .prebuild import submit_all  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("backend")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if config.PREBUILD_ON_START:
        threading.Thread(target=submit_all, args=(jobs.manager,), daemon=True).start()
        log.info("queued frame jobs for the cached test targets")
    yield


app = FastAPI(title="SPHEREx Blink API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

install_error_handlers(app)
app.include_router(api.router)
app.include_router(jobs.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "frontend": config.FRONTEND_DIST.is_dir(),
            "real": ["targets", "resolve", "jobs", "frames", "diff", "gaia", "spectrum", "lightcurve"]}


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
