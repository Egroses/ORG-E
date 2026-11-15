"""Write the stored CatWISE2020 fields of the five test targets (app/catwise_fields/<target>.csv).

Run from backend/ (one query per target; IRSA first, NOIRLab Astro Data Lab if IRSA does not answer):
    python -m scripts.catwise_fields
    python -m scripts.catwise_fields --target wise0855

Every CatWISE2020 source within 0.22 deg of the target, at CatWISE's epoch 2015.405 (the API moves
them to 2026.0). The files are kept in git so the targets' WISE overlay works with no archive.
"""

import argparse
import csv

from app.catwise import COLUMNS, FIELD_LIMIT, FIELD_RADIUS, FIELDS_DIR, query_services
from app.targets import TARGETS


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--target", help="target key, e.g. wise0855")
    args = parser.parse_args()

    FIELDS_DIR.mkdir(exist_ok=True)
    for target in TARGETS:
        if args.target and target.key != args.target:
            continue
        rows = query_services(target.ra, target.dec, FIELD_RADIUS, FIELD_LIMIT)
        if len(rows) >= FIELD_LIMIT:
            raise SystemExit(f"{target.key}: {len(rows)} rows hit the limit; the field would be incomplete")
        rows = sorted(rows, key=lambda row: row["source_name"])
        path = FIELDS_DIR / f"{target.key}.csv"
        with open(path, "w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, COLUMNS, extrasaction="ignore", lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
        print(f"{target.key}: {len(rows)} sources -> {path.name}")


if __name__ == "__main__":
    main()
