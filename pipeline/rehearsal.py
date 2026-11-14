"""Rehearsal: download 5 cutouts and describe them so two machines can be compared."""
import hashlib
import json
import platform
import shutil

import astroquery
import astropy
import numpy
from astropy.io import fits

from . import archive
from .config import REHEARSAL, SIZE_DEG, TARGETS, unit_dir
from .download import sync_unit
from .store import read_manifest

REHEARSAL_TARGET = "barnard"
REHEARSAL_DETECTOR = 6
REHEARSAL_COUNT = 5
COMPARED_FIELDS = ["file", "hdus", "shapes", "sha256_image", "sha256_flags", "sha256_variance", "size_bytes", "manifest_row"]


def _describe(path, manifest_row):
    with fits.open(path, memmap=False) as hdul:
        shapes = {}
        for hdu in hdul:
            data = hdu.data
            shapes[hdu.name] = None if data is None else list(data.shape)

        def digest(name):
            return hashlib.sha256(hdul[name].data.tobytes()).hexdigest()

        return {
            "file": path.name,
            "hdus": [hdu.name for hdu in hdul],
            "shapes": shapes,
            "sha256_image": digest("IMAGE"),
            "sha256_flags": digest("FLAGS"),
            "sha256_variance": digest("VARIANCE"),
            "size_bytes": path.stat().st_size,
            "manifest_row": manifest_row,
        }


def rehearse(who):
    target = TARGETS[REHEARSAL_TARGET]
    root = REHEARSAL / f"cache_{who}"
    if root.exists():
        shutil.rmtree(root)  # a rehearsal always starts from an empty cache
    images = [
        image for image in archive.list_images(target["ra"], target["dec"])
        if image.detector == REHEARSAL_DETECTOR
    ][:REHEARSAL_COUNT]
    directory = unit_dir(root, REHEARSAL_TARGET, REHEARSAL_DETECTOR)
    for attempt in range(1, 4):  # like `download`: run again to retry the files that failed
        result = sync_unit(directory, target["ra"], target["dec"], SIZE_DEG, REHEARSAL_DETECTOR,
                           images, f"rehearsal {who}")
        if not result["failed"]:
            break
        for name in result["failed"]:
            print(f"pass {attempt}: FAILED {name}: {result['errors'][name]}", flush=True)
    else:
        raise SystemExit("rehearsal download failed after 3 passes")
    manifest = read_manifest(directory / "manifest.csv")
    files = [_describe(directory / image.file, manifest[image.file]) for image in images]
    report = {
        "versions": {
            "python": platform.python_version(),
            "astropy": astropy.__version__,
            "astroquery": astroquery.__version__,
            "numpy": numpy.__version__,
        },
        "target": REHEARSAL_TARGET,
        "detector": REHEARSAL_DETECTOR,
        "files": files,
    }
    out = REHEARSAL / f"rehearsal_{who}.json"
    with open(out, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(report, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print(f"wrote {out.relative_to(REHEARSAL.parent)} ({len(files)} files, "
          f"{sum(f['size_bytes'] for f in files)} bytes)")
    return 0


def compare(path_a, path_b):
    with open(path_a, encoding="utf-8") as handle:
        a = json.load(handle)
    with open(path_b, encoding="utf-8") as handle:
        b = json.load(handle)
    for key in sorted(set(a["versions"]) | set(b["versions"])):
        if a["versions"].get(key) != b["versions"].get(key):
            print(f"NOTE version differs: {key}: {a['versions'].get(key)} vs {b['versions'].get(key)}")
    differences = 0
    if len(a["files"]) != len(b["files"]):
        print(f"DIFF number of files: {len(a['files'])} vs {len(b['files'])}")
        differences += 1
    for left, right in zip(a["files"], b["files"]):
        if left["file"] != right["file"]:
            print(f"DIFF file name: {left['file']} vs {right['file']}")
            differences += 1
            continue
        for field in COMPARED_FIELDS:
            if left[field] != right[field]:
                print(f"DIFF {left['file']}: {field}: {left[field]!r} vs {right[field]!r}")
                differences += 1
    print("IDENTICAL" if differences == 0 else f"DIFFERENT ({differences} differences)")
    return 0 if differences == 0 else 1
