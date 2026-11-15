"""Download new SPHEREx images of the five test targets and rebuild what they change.

Run from backend/:
    python -m scripts.refresh                    # every target: new images, then rebuild
    python -m scripts.refresh --check            # only report what the archive has that we lack
    python -m scripts.refresh --target barnard --detector 6
    python -m scripts.refresh --no-build         # download only; the server rebuilds on the next request

SPHEREx releases new images every week (Quick Release). The pipeline cache keeps every file it
has already downloaded, so a refresh lists the archive once per target and downloads only the
missing images (3 connections, as the pipeline SPEC asks). Frame jobs and /api/patch results
store a stamp of the manifests they were built from (`data_stamp`), so anything built from an
older cache is rebuilt, by this command or by the server on the next request.

Only detectors already in the cache are refreshed (a first download is `scripts.prebuild --download`).
"""

import argparse
import csv
import time

from app import config, patch
from app.jobs import JobManager
from app.prebuild import target_requests


def cached_files(directory):
    manifest = directory / "manifest.csv"
    if not manifest.exists():
        return None
    with open(manifest, encoding="utf-8", newline="") as handle:
        return {row["file"] for row in csv.DictReader(handle)}


def download_new(only_target, only_detector, check_only):
    """List the archive per target and fetch images missing from the cache. Returns the units changed."""
    from pipeline import archive
    from pipeline.config import CACHE, DETECTORS, SIZE_DEG, TARGETS, unit_dir
    from pipeline.download import ProgressLog, sync_unit

    log = ProgressLog(CACHE / "download_refresh.log")
    changed = []
    for key, target in TARGETS.items():
        if only_target and key != only_target:
            continue
        images = archive.list_images(target["ra"], target["dec"])
        for detector in DETECTORS:
            if only_detector and detector != only_detector:
                continue
            directory = unit_dir(CACHE, key, detector)
            have = cached_files(directory)
            if have is None:
                print(f"{key} D{detector}: not cached, skipped")
                continue
            listed = [image for image in images if image.detector == detector]
            new = [image for image in listed if image.file not in have]
            if not new:
                print(f"{key} D{detector}: up to date ({len(have)} images)")
                continue
            newest = max(image.t_min for image in new)
            print(f"{key} D{detector}: {len(new)} new image(s), newest MJD {newest:.1f}")
            if check_only:
                continue
            result = sync_unit(directory, target["ra"], target["dec"], SIZE_DEG, detector, listed,
                               f"{key} D{detector}", log=log)
            print(f"    downloaded {result['downloaded']}, failed {len(result['failed'])}")
            changed.append((key, detector))
    return changed


def rebuild(only_target, only_detector):
    """Build every test-target frame job and patch whose cutouts changed (current ones are skipped)."""
    jobs = JobManager(config.JOBS_DIR, max_running=2, live=False)
    pending = [jobs.submit(req) for key, req in target_requests(only_target, only_detector)]
    patches = patch.PatchManager(config.DATA_DIR / "patch", live=False)
    wanted = [p for p in patch.prebuild_requests()
              if (not only_target or p["target"] == only_target) and not patch.missing_detectors(p)]
    states = [patches.request(p) for p in wanted]

    while any(j.status in ("queued", "running") for j in pending) or \
            any(s["status"] in ("queued", "running") for s in states):
        time.sleep(1)
        pending = [jobs.get(j.id) for j in pending]
        states = [patches.request(p) for p in wanted]
    jobs.pool.shutdown()
    patches.pool.shutdown()

    for job in pending:
        if job.status == "failed":
            print(f"frame job {job.id} failed: {job.error.code}: {job.error.message}")
    for params, state in zip(wanted, states):
        if state["status"] == "failed":
            print(f"patch {params['target']} dets={params['dets']} failed: {state['error']['message']}")
    print(f"{len(pending)} frame jobs and {len(states)} patches are current")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--target", help="target key, e.g. barnard")
    parser.add_argument("--detector", type=int, choices=range(1, 7))
    parser.add_argument("--check", action="store_true", help="only report new images, download nothing")
    parser.add_argument("--no-build", action="store_true", help="download only, do not rebuild")
    args = parser.parse_args()

    changed = download_new(args.target, args.detector, args.check)
    if args.check:
        return
    print(f"{len(changed)} unit(s) got new images")
    if not args.no_build:
        rebuild(args.target, args.detector)


if __name__ == "__main__":
    main()
