"""Write the stored Gaia DR3 fields of the five test targets (app/gaia_fields/<target>.csv).

Run from backend/ (one query per target; ESA first, the GAVO mirror if ESA does not answer):
    python -m scripts.gaia_fields
    python -m scripts.gaia_fields --target barnard

Every source brighter than G = 19 within 0.2 deg of the target, at Gaia's epoch 2016.0
(the API moves them to 2026.0). The files are small and kept in git so the targets' catalogue
works with no archive.
"""

import argparse
import csv

from app.gaia import COLUMNS, FIELD_GMAG, FIELD_LIMIT, FIELD_RADIUS, FIELDS_DIR, query_services
from app.targets import TARGETS


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--target", help="target key, e.g. barnard")
    args = parser.parse_args()

    FIELDS_DIR.mkdir(exist_ok=True)
    for target in TARGETS:
        if args.target and target.key != args.target:
            continue
        rows = query_services(target.ra, target.dec, FIELD_RADIUS, FIELD_GMAG, FIELD_LIMIT)
        if len(rows) >= FIELD_LIMIT:
            raise SystemExit(f"{target.key}: {len(rows)} rows hit the limit; the field would be incomplete")
        rows = sorted(rows, key=lambda row: int(row["source_id"]))  # stable file, small diffs
        path = FIELDS_DIR / f"{target.key}.csv"
        with open(path, "w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, COLUMNS, extrasaction="ignore", lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
        print(f"{target.key}: {len(rows)} sources -> {path.name}")


if __name__ == "__main__":
    main()
