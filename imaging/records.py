"""Read cutout records from the pipeline cache layout (cache/<target>/D<det>/manifest.csv).

A record is what `pipeline.get_cutouts` returns:
{"path", "mjd", "detector", "wavelength_um", "collection", "version", "obs_id"}.
AI-assisted code (Claude Code).
"""

import csv
from pathlib import Path


def load_records(cache_dir, target, detector):
    """Records of one target and detector; [] if that detector has no manifest."""
    folder = Path(cache_dir) / target / f"D{detector}"
    manifest = folder / "manifest.csv"
    if not manifest.is_file():
        return []
    with open(manifest, encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    return [{"path": str(folder / r["file"]), "mjd": float(r["mjd"]), "detector": int(r["detector"]),
             "wavelength_um": float(r["wavelength_um"]), "collection": r.get("collection", ""),
             "version": r.get("version", ""), "obs_id": r.get("obs_id", "")} for r in rows]


def load_records_by_detector(cache_dir, target, detectors):
    return {d: load_records(cache_dir, target, d) for d in detectors}
