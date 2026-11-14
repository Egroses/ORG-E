"""Constants and shared definitions for the SPHEREx data pipeline (see SPEC.md)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache"
REHEARSAL = ROOT / "rehearsal"

COLLECTIONS = ["spherex_dr1", "spherex_qr3"]
DETECTORS = (1, 2, 3, 4, 5, 6)

# HDUs kept in every stored cutout, in this order (EPSF is dropped).
LAYERS = ["PRIMARY", "IMAGE", "FLAGS", "VARIANCE", "ZODI", "WCS-WAVE"]

MAX_CONNECTIONS = 3
MAX_ATTEMPTS = 8
REQUEST_TIMEOUT = 60
DEFAULT_RETRY_AFTER = 5

MANIFEST_COLUMNS = [
    "file", "obs_id", "mjd", "date_avg", "detector", "wavelength_um",
    "collection", "version", "ra_center", "dec_center", "size_deg", "source_url",
]


def _load_targets():
    with open(Path(__file__).with_name("targets.json"), encoding="utf-8") as handle:
        data = json.load(handle)
    return float(data["size_deg"]), data["targets"]


SIZE_DEG, TARGETS = _load_targets()

# Each person's share as an ordered list of (target, detector) units.
ASSIGNMENTS = {
    "A": (
        [("barnard", 6), ("wise0855", 6)]
        + [("barnard", d) for d in (5, 4, 3, 2, 1)]
        + [("wise0855", d) for d in (5, 4, 3, 2, 1)]
        + [("rwaur", d) for d in (6, 5, 4, 3, 2, 1)]
        + [("rdra", d) for d in (3, 2, 1)]
    ),
    "B": (
        [("epsindb", d) for d in (6, 5, 4, 3, 2, 1)]
        + [("rdra", d) for d in (6, 5, 4)]
    ),
}
ALL_UNITS = [(key, d) for key in TARGETS for d in DETECTORS]


def unit_dir(root, key, detector):
    return Path(root) / key / f"D{detector}"
