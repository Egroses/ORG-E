"""Cache file storage: cutout FITS files and manifest.csv (see SPEC sections 4-6)."""
import csv
import io
import logging
import os
import warnings

import astropy.units as u
from astropy.io import fits
from astropy.wcs import WCS

from .config import LAYERS, MANIFEST_COLUMNS

logging.getLogger("astropy").setLevel(logging.ERROR)  # silence the harmless SIP/WCS notice


class BadCutout(ValueError):
    """The downloaded bytes are not a valid SPHEREx cutout."""


def write_cutout(content, dest):
    """Drop the EPSF HDU from a downloaded cutout and store it atomically at dest."""
    if len(content) % 2880 != 0:
        raise BadCutout("response is truncated (size is not a multiple of 2880)")
    try:
        hdul = fits.open(io.BytesIO(content), memmap=False)
    except Exception as exc:
        raise BadCutout(f"not a FITS file: {exc}") from exc
    with hdul:
        keep = [hdu for hdu in hdul if hdu.name != "EPSF"]
        names = [hdu.name for hdu in keep]
        if names != LAYERS:
            raise BadCutout(f"unexpected layers: {names}")
        for hdu in keep[1:]:
            _ = hdu.data  # force reading; fails on damaged data
        tmp = dest.with_name(dest.name + ".part")
        fits.HDUList(keep).writeto(tmp, checksum=False, overwrite=True)
    os.replace(tmp, dest)


def center_wavelength_um(hdul):
    """Wavelength (micron) at the centre of the cutout, from the WCS-WAVE lookup."""
    ny, nx = hdul["IMAGE"].data.shape
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        wcs = WCS(hdul["IMAGE"].header, fobj=hdul, key="W")
        wcs.sip = None
        wavelength, _bandwidth = wcs.pixel_to_world((nx - 1) / 2, (ny - 1) / 2)
    return float(wavelength.to(u.um).value)


def read_record(path):
    """Values read from a stored cutout file."""
    with fits.open(path, memmap=False) as hdul:
        names = [hdu.name for hdu in hdul]
        if names != LAYERS:
            raise BadCutout(f"unexpected layers: {names}")
        header = hdul["IMAGE"].header
        return {
            "mjd": float(header["MJD-AVG"]),
            "date_avg": str(header["DATE-AVG"]),
            "version": str(hdul["PRIMARY"].header["VERSION"]),
            "wavelength_um": center_wavelength_um(hdul),
        }


def read_manifest(path):
    if not path.exists():
        return {}
    with open(path, encoding="utf-8", newline="") as handle:
        return {row["file"]: row for row in csv.DictReader(handle)}


def rebuild_manifest(unit_dir, ra, dec, size_deg, detector, listing_by_file, cutout_url):
    """Rewrite manifest.csv from the cutout files in unit_dir.

    obs_id, collection and source_url come from the archive listing; for files that are
    no longer listed they are taken from the previous manifest.
    """
    old = read_manifest(unit_dir / "manifest.csv")
    rows = []
    for path in sorted(unit_dir.glob("*.fits")):
        record = read_record(path)
        image = listing_by_file.get(path.name)
        if image is not None:
            obs_id = image.obs_id
            collection = image.collection
            source_url = cutout_url(image.access_url, ra, dec, size_deg)
        elif path.name in old:
            obs_id = old[path.name]["obs_id"]
            collection = old[path.name]["collection"]
            source_url = old[path.name]["source_url"]
        else:
            raise BadCutout(f"{path.name}: not in the archive listing and not in the old manifest")
        rows.append({
            "file": path.name,
            "obs_id": obs_id,
            "mjd": f"{record['mjd']:.6f}",
            "date_avg": record["date_avg"],
            "detector": str(detector),
            "wavelength_um": f"{record['wavelength_um']:.4f}",
            "collection": collection,
            "version": record["version"],
            "ra_center": f"{ra:.6f}",
            "dec_center": f"{dec:.6f}",
            "size_deg": f"{size_deg:.3f}",
            "source_url": source_url,
        })
    rows.sort(key=lambda row: (float(row["mjd"]), row["file"]))
    write_manifest(unit_dir / "manifest.csv", rows)
    return rows


def write_manifest(path, rows):
    tmp = path.with_name(path.name + ".part")
    with open(tmp, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=MANIFEST_COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    os.replace(tmp, path)
