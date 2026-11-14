"""Library entry point used by the service: get_cutouts()."""
import csv

from . import archive
from .config import CACHE, MAX_CONNECTIONS, SIZE_DEG, TARGETS, unit_dir
from .download import sync_unit


def _target_key(ra, dec, size_deg):
    for key, target in TARGETS.items():
        if abs(ra - target["ra"]) < 5e-7 and abs(dec - target["dec"]) < 5e-7 and abs(size_deg - SIZE_DEG) < 1e-9:
            return key
    return None


def _directory(ra, dec, size_deg, detector):
    key = _target_key(ra, dec, size_deg)
    if key is not None:
        return unit_dir(CACHE, key, detector)
    return CACHE / "custom" / f"{ra:.6f}_{dec:.6f}_{size_deg:.3f}" / f"D{detector}"


def get_cutouts(ra, dec, size_deg, detector, *, workers=MAX_CONNECTIONS, on_progress=None):
    """Cutouts of one detector around (ra, dec), oldest first; missing ones are downloaded.

    Returns a list of dicts: path, mjd, detector, wavelength_um, collection, version, obs_id.
    `on_progress(done, total, failed)` is called after each downloaded file.
    """
    directory = _directory(ra, dec, size_deg, detector)
    images = [image for image in archive.list_images(ra, dec) if image.detector == detector]
    sync_unit(directory, ra, dec, size_deg, detector, images, f"custom D{detector}",
              workers=workers, on_progress=on_progress)
    with open(directory / "manifest.csv", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    return [
        {
            "path": str(directory / row["file"]),
            "mjd": float(row["mjd"]),
            "detector": int(row["detector"]),
            "wavelength_um": float(row["wavelength_um"]),
            "collection": row["collection"],
            "version": row["version"],
            "obs_id": row["obs_id"],
        }
        for row in rows
    ]
