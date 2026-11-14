"""FastAPI entry point. Run from backend/: uvicorn app.main:app --reload"""

import truststore

truststore.inject_into_ssl()  # use the OS certificate store (Windows TLS errors otherwise)

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import RedirectResponse  # noqa: E402

from . import api, mock  # noqa: E402
from .errors import install_error_handlers  # noqa: E402

app = FastAPI(title="SPHEREx Blink API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

install_error_handlers(app)
app.include_router(api.router)
app.include_router(mock.router)


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse("/docs")


@app.get("/api/health")
def health():
    return {"status": "ok", "real": ["targets", "resolve"], "mock": ["jobs", "frames", "diff",
                                                                   "spectrum", "lightcurve", "gaia"]}
