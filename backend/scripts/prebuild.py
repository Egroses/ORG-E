"""Pre-generate frames for the five test targets from the local pipeline cache.

Run from backend/:
    python -m scripts.prebuild                      # every cached target/detector
    python -m scripts.prebuild --target barnard --detector 6
    python -m scripts.prebuild --refresh            # rebuild even if frames exist

Only units whose cutouts are already in cache/ are built; nothing is downloaded.
Each target is built in its default mode (WISE 0855: shift_add with its proper motion).
"""

import argparse
import shutil
import time

from app import config
from app.jobs import JobManager, job_id_for, normalize
from app.models import JobRequest
from app.targets import TARGETS


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--target", help="target key, e.g. barnard")
    parser.add_argument("--detector", type=int, choices=range(1, 7))
    parser.add_argument("--refresh", action="store_true", help="rebuild existing frames")
    args = parser.parse_args()

    requests = []
    for t in TARGETS:
        if args.target and t.key != args.target:
            continue
        for detector in ([args.detector] if args.detector else range(1, 7)):
            if not (config.REPO_ROOT / "cache" / t.key / f"D{detector}" / "manifest.csv").exists():
                print(f"skip {t.key} D{detector}: not in cache")
                continue
            modes = ["epoch"] + (["shift_add"] if t.mode == "shift_add" else [])
            for mode in modes:
                requests.append((t.key, JobRequest(ra=t.ra, dec=t.dec, fov=0.1, detector=detector,
                                                   mode=mode, pmra=t.pmra, pmdec=t.pmdec)))

    if args.refresh:
        for _, req in requests:
            shutil.rmtree(config.JOBS_DIR / job_id_for(normalize(req)), ignore_errors=True)

    manager = JobManager(config.JOBS_DIR, max_running=2)
    for key, req in requests:
        start = time.time()
        job = manager.submit(req)
        while job.status in ("queued", "running"):
            time.sleep(0.5)
            job = manager.get(job.id)
        detail = f"{len(job.frames)} frames" if job.status == "done" else f"{job.error.code}: {job.error.message}"
        print(f"{key} D{req.detector} {req.mode}: {job.status} ({detail}) id={job.id} {time.time() - start:.1f}s")
    manager.pool.shutdown()


if __name__ == "__main__":
    main()
