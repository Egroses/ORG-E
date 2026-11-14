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

# Center epoch of the frames (decimal year); positions from /api/resolve use the same.
CENTER_EPOCH = 2026.0

# The pipeline package lives at the repository root.
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
