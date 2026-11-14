"""Cache verification against the current archive listing (SPEC section 11)."""
import csv

from . import archive
from .config import CACHE, MANIFEST_COLUMNS, SIZE_DEG, TARGETS, unit_dir
from .store import BadCutout, read_record


def _check_manifest(directory, key, found):
    """Return a list of manifest problems (empty when the manifest is consistent)."""
    problems = []
    path = directory / "manifest.csv"
    if not path.exists():
        return ["manifest.csv is missing"] if found else []
    with open(path, encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != MANIFEST_COLUMNS:
            return [f"manifest columns differ: {reader.fieldnames}"]
        rows = list(reader)
    names = [row["file"] for row in rows]
    if len(rows) != len(found):
        problems.append(f"manifest has {len(rows)} rows for {len(found)} files")
    if len(set(names)) != len(names):
        problems.append("duplicate file names in manifest")
    for name in names:
        if name not in found:
            problems.append(f"manifest row without file: {name}")
    target = TARGETS[key]
    expected = (f"{target['ra']:.6f}", f"{target['dec']:.6f}", f"{SIZE_DEG:.3f}")
    for row in rows:
        if (row["ra_center"], row["dec_center"], row["size_deg"]) != expected:
            problems.append(f"center or size differs from targets.json: {row['file']}")
            break
    order = [(float(row["mjd"]), row["file"]) for row in rows]
    if order != sorted(order):
        problems.append("manifest rows are not sorted by (mjd, file)")
    return problems


def verify(units):
    """Check every (target, detector) unit; print a table and return True when all pass."""
    listings = {}
    all_ok = True
    total_files = 0
    total_bytes = 0
    for key, detector in units:
        target = TARGETS[key]
        if key not in listings:
            listings[key] = archive.list_images(target["ra"], target["dec"])
        expected = {image.file for image in listings[key] if image.detector == detector}
        directory = unit_dir(CACHE, key, detector)
        files = sorted(path for path in directory.glob("*.fits")) if directory.exists() else []
        found = {path.name for path in files}
        bad = []
        for path in files:
            try:
                read_record(path)
            except Exception as exc:  # unreadable or wrong layout
                bad.append(f"{path.name}: {type(exc).__name__}")
        leftovers = sorted(path.name for path in directory.glob("*.part")) if directory.exists() else []
        manifest_problems = _check_manifest(directory, key, found)
        missing = sorted(expected - found)
        extra = sorted(found - expected)
        ok = not (missing or extra or bad or leftovers or manifest_problems)
        all_ok = all_ok and ok
        total_files += len(files)
        total_bytes += sum(path.stat().st_size for path in files)
        print(
            f"{key:9s} D{detector}: expected={len(expected):4d} found={len(found):4d} "
            f"missing={len(missing)} extra={len(extra)} bad={len(bad)} "
            f"part={len(leftovers)} manifest={'ok' if not manifest_problems else 'PROBLEM'}"
            f"{'' if ok else '  <-- FAIL'}"
        )
        for line in (bad + manifest_problems)[:5]:
            print(f"    {line}")
        if missing:
            print(f"    first missing: {missing[0]}")
        if extra:
            print(f"    first extra: {extra[0]}")
    print(f"total files={total_files} total size={total_bytes / 1e6:.1f} MB")
    print("PASS" if all_ok else "FAIL")
    return all_ok
