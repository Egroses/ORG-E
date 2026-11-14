"""Pre-generate frames for the five test targets from the local pipeline cache.

Run from backend/:
    python -m scripts.prebuild                      # every cached target/detector
    python -m scripts.prebuild --target barnard --detector 6
    python -m scripts.prebuild --refresh            # rebuild even if frames exist
    python -m scripts.prebuild --download           # also download missing cutouts (slow)

Without --download only units whose cutouts are already in cache/ are built.
Each target is built in its default mode (WISE 0855: also shift_add with its proper motion).
"""

import argparse
import shutil
import time

from app import config
from app.jobs import JobManager, job_id_for, normalize
from app.prebuild import target_requests


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--target", help="target key, e.g. barnard")
    parser.add_argument("--detector", type=int, choices=range(1, 7))
    parser.add_argument("--refresh", action="store_true", help="rebuild existing frames")
    parser.add_argument("--download", action="store_true",
                        help="also build units not in the cache (downloads from IRSA, 2-5 min each)")
    args = parser.parse_args()

    requests = target_requests(args.target, args.detector, include_uncached=args.download)
    if not requests:
        print("nothing to build: no target cutouts in cache/")
        return
    if args.refresh:
        for _, req in requests:
            shutil.rmtree(config.JOBS_DIR / job_id_for(normalize(req)), ignore_errors=True)

    # one job at a time while downloading: each job already opens 3 archive connections (SPEC 7)
    manager = JobManager(config.JOBS_DIR, max_running=1 if args.download else 2)
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
