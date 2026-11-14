"""Which frame jobs to pre-generate for the five test targets."""

from . import config
from .models import JobRequest
from .targets import TARGETS


def cached_detectors(key: str):
    return [d for d in range(1, 7)
            if (config.REPO_ROOT / "cache" / key / f"D{d}" / "manifest.csv").exists()]


def target_requests(only_target=None, only_detector=None, include_uncached=False):
    """(target key, JobRequest) for every cached target/detector in its default mode(s).

    With include_uncached, every detector is listed (missing cutouts are then downloaded
    by the job). WISE 0855 also gets a shift_add job with its proper motion.
    """
    requests = []
    for t in TARGETS:
        if only_target and t.key != only_target:
            continue
        detectors = range(1, 7) if include_uncached else cached_detectors(t.key)
        for detector in detectors:
            if only_detector and detector != only_detector:
                continue
            modes = ["epoch"] + (["shift_add"] if t.mode == "shift_add" else [])
            for mode in modes:
                requests.append((t.key, JobRequest(ra=t.ra, dec=t.dec, fov=0.1, detector=detector,
                                                   mode=mode, pmra=t.pmra, pmdec=t.pmdec)))
    return requests


def submit_all(manager):
    """Queue every cached test-target job; finished ones are answered from disk at once."""
    for _, request in target_requests():
        manager.submit(request)
