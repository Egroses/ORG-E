"""Paths and settings. Override with environment variables on the server."""

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent

# Job outputs (job.json, PNG frames, stacks). Must be on a persistent disk in production.
DATA_DIR = Path(os.environ.get("BACKEND_DATA_DIR", BACKEND_DIR / "data"))
JOBS_DIR = DATA_DIR / "jobs"

# At most this many jobs download/process at the same time; the rest wait as "queued".
MAX_RUNNING_JOBS = int(os.environ.get("MAX_RUNNING_JOBS", "2"))

# Built frontend (Vite `dist/`). If it exists, the backend serves it at "/" (one URL for all).
FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST", REPO_ROOT / "frontend" / "dist"))

# Build frames for the cached test targets in the background when the server starts.
PREBUILD_ON_START = os.environ.get("PREBUILD_ON_START", "0") == "1"

# 1: positions not in the cache are downloaded from IRSA (2-5 min). 0: only cached positions
# (the test targets) open; anything else answers archive_unavailable at once.
LIVE_QUERIES = os.environ.get("LIVE_QUERIES", "1") == "1"
# Where live downloads come from: "s3" reads the public AWS copy of the images (pipeline/s3.py,
# ~10x faster, IRSA as fallback per file), "irsa" uses IRSA's cutout service only.
ARCHIVE_SOURCE = os.environ.get("ARCHIVE_SOURCE", "s3")

# Center epoch of the frames (decimal year); positions from /api/resolve use the same.
CENTER_EPOCH = 2026.0

# The pipeline package lives at the repository root.
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
