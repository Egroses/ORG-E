"""Test setup: make `imaging` and `backend` importable from the repository root."""
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

CACHE = Path(os.environ.get("ORG_CACHE", r"E:\nasa\ORG-E\cache"))


@pytest.fixture(scope="session")
def cache():
    if not (CACHE / "barnard" / "D6" / "manifest.csv").is_file():
        pytest.skip(f"data cache not found at {CACHE} (set ORG_CACHE)")
    return CACHE
