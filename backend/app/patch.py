"""GET /api/patch: float32 epoch stacks for the game (contract: docs/patch-api.md).

The numbers come from imaging.make_patch / imaging.encode_patch; this module validates the
request, snaps it to a cached test target, runs the build in the background, keeps the result
on disk (gzipped JSON) and answers 202 while building, 200 when done or failed.
"""

import gzip
import hashlib
import importlib.util
import json
import logging
import math
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from . import config
from .errors import ApiError
from .jobs import LIVE_OFF_MESSAGE, _records_from_manifest, data_stamp
from .targets import TARGETS

log = logging.getLogger("backend.patch")

SNAP_ARCSEC = 10.0     # a request this close to a test target is served from that target's cache
CUTOUT_DEG = 0.1       # size of the cached test-target cutouts
FOV_RANGE = (0.05, 0.25)
DEFAULT_DETS = "2,4,6"
# GET both starts and polls a patch, so a failed one is reported for this long before a new
# request tries again (otherwise a polling client would only ever see 202).
RETRY_AFTER_S = 60.0

# Epoch settings the frontend asks for (docs/patch-api.md, "Epoch settings used by the frontend").
# Pre-built at start so the game opens at once.
FRONTEND_EPOCHS = {"rdra": (60.0, 150.0)}
FRONTEND_EPOCHS_DEFAULT = (30.0, 60.0)
PREBUILD_DETS = ([2, 4, 6], [1, 2, 3, 4, 5, 6])

_NO_IMAGING = "The imaging module is not installed on this server, so /api/patch cannot build patches yet."


def imaging_available() -> bool:
    return importlib.util.find_spec("imaging") is not None


# ---------- request ----------

def parse(ra, dec, fov, dets, gap_days, max_span_days) -> dict:
    """Validated, normalised parameters; raises ApiError('bad_input')."""
    if not (0 <= ra < 360 and -90 <= dec <= 90):
        raise ApiError("bad_input", "RA must be 0-360 and Dec -90..+90 degrees.")
    if not FOV_RANGE[0] <= fov <= FOV_RANGE[1]:
        raise ApiError("bad_input", f"fov must be between {FOV_RANGE[0]} and {FOV_RANGE[1]} degrees.")
    try:
        detectors = sorted({int(d) for d in dets.split(",") if d.strip()})
    except ValueError:
        raise ApiError("bad_input", "dets must be a comma-separated list of detectors, e.g. 2,4,6.")
    if not detectors or any(not 1 <= d <= 6 for d in detectors):
        raise ApiError("bad_input", "dets must list detectors numbered 1 to 6.")
    if not (gap_days > 0 and max_span_days > 0):
        raise ApiError("bad_input", "gap_days and max_span_days must be positive.")
    params = {"ra": ra, "dec": dec, "fov": fov, "dets": detectors,
              "gap_days": float(gap_days), "max_span_days": float(max_span_days), "target": None}
    target = find_target(ra, dec)
    if target is not None:
        params.update(ra=target.ra, dec=target.dec, target=target.key)
    return params


def find_target(ra, dec):
    """The test target within SNAP_ARCSEC of (ra, dec), or None."""
    for t in TARGETS:
        dra = (ra - t.ra + 180) % 360 - 180
        sep = math.hypot(dra * math.cos(math.radians(dec)), dec - t.dec) * 3600
        if sep <= SNAP_ARCSEC:
            return t
    return None


def patch_id(params) -> str:
    key = {"ra": round(params["ra"], 4), "dec": round(params["dec"], 4), "fov": round(params["fov"], 3),
           "dets": params["dets"], "gap_days": round(params["gap_days"], 2),
           "max_span_days": round(params["max_span_days"], 2)}
    return hashlib.sha1(json.dumps(key, sort_keys=True).encode()).hexdigest()[:12]


def unit_dir(params, detector) -> Path:
    """Cache folder of one detector: the target's cache, or a custom folder for other positions."""
    from pipeline.cutouts import _directory  # imported late: heavy, network setup
    size = CUTOUT_DEG if params["target"] else params["fov"]
    return _directory(params["ra"], params["dec"], size, detector)


def missing_detectors(params):
    return [d for d in params["dets"] if not (unit_dir(params, d) / "manifest.csv").exists()]


# ---------- background builds ----------

class PatchManager:
    def __init__(self, out_dir: Path, max_running: int = 1, live: bool = True):
        self.out_dir = out_dir
        self.live = live
        self.jobs: dict = {}  # id -> {"status", "progress", "error"?}; done results live on disk
        self.lock = threading.Lock()
        self.pool = ThreadPoolExecutor(max_running, thread_name_prefix="patch")

    def result_path(self, job_id) -> Path:
        return self.out_dir / f"{job_id}.json.gz"

    def stamp_path(self, job_id) -> Path:
        return self.out_dir / f"{job_id}.data"

    def is_current(self, job_id, params) -> bool:
        """True when the stored patch exists and was built from the cutouts now in the cache."""
        if not self.result_path(job_id).exists() or not self.stamp_path(job_id).exists():
            return False
        stored = self.stamp_path(job_id).read_text(encoding="utf-8").strip()
        return stored == data_stamp(unit_dir(params, d) for d in params["dets"])

    @staticmethod
    def _busy(state) -> bool:
        return state is not None and (state["status"] in ("queued", "running")
                                      or (state["status"] == "failed" and not PatchManager._may_retry(state)))

    def request(self, params) -> dict:
        """State of the patch for these parameters, starting its build if needed.

        A stored patch whose cutouts changed since it was built (new data) is rebuilt.
        """
        job_id = patch_id(params)
        with self.lock:
            state = self.jobs.get(job_id)
            if self._busy(state):
                return {"id": job_id, **state}
        if self.is_current(job_id, params):
            return {"id": job_id, "status": "done"}
        if not imaging_available():
            return {"id": job_id, "status": "failed", "error": {"code": "internal_error", "message": _NO_IMAGING}}
        missing = missing_detectors(params)
        if missing and not self.live:
            return {"id": job_id, "status": "failed",
                    "error": {"code": "archive_unavailable", "message": LIVE_OFF_MESSAGE}}
        with self.lock:
            state = self.jobs.get(job_id)  # another request may have started it meanwhile
            if self._busy(state):
                return {"id": job_id, **state}
            self.jobs[job_id] = {"status": "queued", "progress": {"total": 0, "done": 0, "failed": 0}}
            snapshot = {"id": job_id, **self.jobs[job_id]}
        self.pool.submit(self._run, job_id, params)
        return snapshot

    @staticmethod
    def _may_retry(state) -> bool:
        return state["status"] == "failed" and time.time() - state.get("failed_at", 0) > RETRY_AFTER_S

    def _set(self, job_id, **fields):
        with self.lock:
            self.jobs[job_id].update(fields)

    def _fail(self, job_id, code, message):
        log.warning("patch %s failed: %s %s", job_id, code, message)
        self._set(job_id, status="failed", error={"code": code, "message": message}, failed_at=time.time())

    @staticmethod
    def _download_missing(params, progress):
        """Fetch the detectors not in the cache from the archive, one after the other.

        The archive is listed once for the position (one SIA query for all detectors) and each
        detector goes through the pipeline's sync_unit (3 connections). Files already on disk are
        kept, so a download cut by a restart continues where it stopped on the next request.
        Progress counts the files of every missing detector together (0 to total once) and adds
        `detector_done` / `detector_total` and `eta_s` (seconds left at the speed so far).
        """
        missing = missing_detectors(params)
        if not missing:
            return
        from pipeline import archive
        from pipeline.download import sync_unit

        extra = {"detector_done": 0, "detector_total": len(missing)}
        progress(0, 0, 0, **extra)
        images = archive.list_images(params["ra"], params["dec"])
        size = CUTOUT_DEG if params["target"] else params["fov"]
        per_det = {det: [i for i in images if i.detector == det] for det in missing}
        total = sum(len(v) for v in per_det.values())
        before = {"done": 0, "failed": 0}
        started, first_done = time.time(), None

        def report(done, failed):
            nonlocal first_done
            if first_done is None:
                first_done = done  # files already on disk do not tell the speed
            fetched = done - first_done
            eta = None
            if fetched >= 5:
                eta = round((time.time() - started) / fetched * (total - done - failed))
            progress(done, total, failed, **extra, eta_s=eta)

        report(0, 0)
        for det in missing:
            def step(done, _total, failed, base=dict(before)):
                report(base["done"] + done, base["failed"] + failed)
            result = sync_unit(unit_dir(params, det), params["ra"], params["dec"], size, det, per_det[det],
                               f"patch D{det}", on_progress=step)
            before["done"] += result["cached"] + result["downloaded"]
            before["failed"] += len(result["failed"])
            extra["detector_done"] += 1
            report(before["done"], before["failed"])

    def _run(self, job_id, params):
        self._set(job_id, status="running")

        def progress(done, total, failed, **extra):
            """extra (download only): detector_done, detector_total, eta_s; the stacking step has none."""
            self._set(job_id, progress={"total": total, "done": done, "failed": failed, **extra})

        try:
            self._download_missing(params, progress)
            records = {det: _records_from_manifest(unit_dir(params, det)) for det in params["dets"]}
            stamp = data_stamp(unit_dir(params, d) for d in params["dets"])
        except Exception as exc:  # archive errors come in many types (HTTP, DAL, timeouts)
            log.exception("cutout search failed for patch %s", job_id)
            return self._fail(job_id, "archive_unavailable", f"The SPHEREx archive did not answer: {exc}")
        if not any(records.values()):
            return self._fail(job_id, "no_coverage", "SPHEREx has no images of this position in these detectors yet.")

        try:
            from imaging import encode_patch, make_patch
            patch = make_patch(records, params["ra"], params["dec"], params["fov"],
                               params["gap_days"], params["max_span_days"], progress=progress)
            if not patch.epochs:
                return self._fail(job_id, "no_coverage", "No readable SPHEREx images at this position.")
            if params["target"] and params["fov"] > CUTOUT_DEG:
                patch.warnings.append(f"The cached images are {CUTOUT_DEG} deg wide; the edges of this larger "
                                      "field have no data.")
            payload = encode_patch(patch, job_id)
            body = json.dumps(payload, allow_nan=False, separators=(",", ":")).encode()
        except Exception as exc:
            log.exception("patch build failed for %s", job_id)
            return self._fail(job_id, "internal_error", f"Could not build the patch: {exc}")

        self.out_dir.mkdir(parents=True, exist_ok=True)
        tmp = self.result_path(job_id).with_suffix(".tmp")
        tmp.write_bytes(gzip.compress(body, 6))
        tmp.replace(self.result_path(job_id))  # never serve a half-written file
        self.stamp_path(job_id).write_text(stamp, encoding="utf-8")
        self._set(job_id, status="done")
        log.info("patch %s done: %d epochs, %d bytes", job_id, len(payload["epochs"]), len(body))


manager = PatchManager(config.DATA_DIR / "patch", live=config.LIVE_QUERIES)


def prebuild_requests():
    """Parameters of the patches the frontend asks for on the five test targets."""
    out = []
    for t in TARGETS:
        gap, span = FRONTEND_EPOCHS.get(t.key, FRONTEND_EPOCHS_DEFAULT)
        for dets in PREBUILD_DETS:
            out.append(parse(t.ra, t.dec, CUTOUT_DEG, ",".join(map(str, dets)), gap, span))
    return out


def submit_all(patch_manager=None):
    patch_manager = patch_manager or manager
    for params in prebuild_requests():
        if not missing_detectors(params):
            patch_manager.request(params)


# ---------- HTTP ----------

router = APIRouter(prefix="/api")


@router.get("/patch")
def get_patch(request: Request, ra: float, dec: float, fov: float = 0.1, dets: str = DEFAULT_DETS,
              gap_days: float = 10.0, max_span_days: float = 30.0):
    """Float32 epoch stacks per detector for the game; poll every ~2 s (202 while building)."""
    state = manager.request(parse(ra, dec, fov, dets, gap_days, max_span_days))
    if state["status"] in ("queued", "running"):
        return JSONResponse({"status": state["status"], "id": state["id"], "progress": state["progress"]},
                            status_code=202)
    if state["status"] == "failed":
        return JSONResponse({"status": "failed", "id": state["id"], "error": state["error"]})  # 200, as the contract says
    body = manager.result_path(state["id"]).read_bytes()
    headers = {"Vary": "Accept-Encoding"}
    if "gzip" in request.headers.get("accept-encoding", ""):
        return Response(body, media_type="application/json", headers={**headers, "Content-Encoding": "gzip"})
    return Response(gzip.decompress(body), media_type="application/json", headers=headers)
