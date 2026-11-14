"""Export the test targets as static files: the fallback if the server is down.

Run from backend/ after the frames exist (python -m scripts.prebuild):
    python -m scripts.export_static                    # writes data/static/
    python -m scripts.export_static --out ../frontend/public/static

Layout (all paths relative to the export folder, so it works under any base URL):
    index.html                     stand-alone viewer (blink, shift & add, difference)
    index.json                     what is inside: targets and one entry per job
    targets.json                   same as GET /api/targets
    jobs/<id>.json                 same as GET /api/jobs/<id>, frame urls made relative
    frames/<id>/<n>.png            the frames
    frames/<id>/diff_<a>_<b>.png   first vs last frame
    spectrum/<key>.json            same as GET /api/spectrum (with the target's proper motion)
    lightcurve/<key>_D<n>.json     same as GET /api/lightcurve for each cached detector
    gaia/<key>.json                same as GET /api/gaia (skipped if Gaia is unreachable)
Nothing is downloaded from IRSA; only targets already in the cache are exported.
"""

import argparse
import json
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path

from app import config
from app.errors import ApiError
from app.frames import write_diff_png
from app.gaia import gaia_sources
from app.jobs import JobManager
from app.photometry import photometry
from app.prebuild import target_requests
from app.targets import TARGETS, TARGETS_BY_KEY


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=config.DATA_DIR / "static")
    parser.add_argument("--no-gaia", action="store_true", help="skip the Gaia queries")
    args = parser.parse_args()
    out = args.out.resolve()
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    manager = JobManager(config.JOBS_DIR, max_running=2)
    entries, exported_keys = [], set()
    for key, req in target_requests():
        job = manager.submit(req)
        while job.status in ("queued", "running"):
            time.sleep(0.5)
            job = manager.get(job.id)
        if job.status != "done":
            print(f"skip {key} D{req.detector} {req.mode}: {job.error.code if job.error else job.status}")
            continue

        src, dst = config.JOBS_DIR / job.id, out / "frames" / job.id
        dst.mkdir(parents=True, exist_ok=True)
        for frame in job.frames:
            shutil.copyfile(src / f"{frame.n}.png", dst / f"{frame.n}.png")
            frame.url = f"frames/{job.id}/{frame.n}.png"
        last = len(job.frames) - 1
        diff = None
        if last > 0:
            write_diff_png(src / "stacks.npz", 0, last, dst / f"diff_0_{last}.png")
            diff = f"frames/{job.id}/diff_0_{last}.png"
        write_json(out / "jobs" / f"{job.id}.json", job.model_dump())
        entries.append({"target": key, "detector": req.detector, "mode": req.mode,
                        "job": f"jobs/{job.id}.json", "diff": diff})
        exported_keys.add(key)
        print(f"{key} D{req.detector} {req.mode}: {len(job.frames)} frames")
    manager.pool.shutdown()

    for key in sorted(exported_keys):
        t = TARGETS_BY_KEY[key]
        points = photometry(t.ra, t.dec, t.pmra, t.pmdec)
        write_json(out / "spectrum" / f"{key}.json", sorted(points, key=lambda p: (p["wavelength_um"], p["mjd"])))
        for detector in sorted({p["detector"] for p in points}):
            curve = sorted((p for p in points if p["detector"] == detector), key=lambda p: p["mjd"])
            write_json(out / "lightcurve" / f"{key}_D{detector}.json", curve)
        if not args.no_gaia:
            try:
                write_json(out / "gaia" / f"{key}.json",
                           [s.model_dump() for s in gaia_sources(t.ra, t.dec)])
            except ApiError as exc:
                print(f"gaia skipped for {key}: {exc.message}")
        print(f"{key}: spectrum {len(points)} points")

    write_json(out / "targets.json", [t.model_dump() for t in TARGETS])
    write_json(out / "index.json", {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "targets": "targets.json",
        "jobs": entries,
        "spectrum": {key: f"spectrum/{key}.json" for key in sorted(exported_keys)},
        "gaia": {key: f"gaia/{key}.json" for key in sorted(exported_keys)
                 if (out / "gaia" / f"{key}.json").exists()},
    })
    # A small stand-alone viewer, so the export works even without the frontend.
    shutil.copyfile(Path(__file__).with_name("static_viewer.html"), out / "index.html")
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    print(f"exported {len(entries)} jobs to {out} ({size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
