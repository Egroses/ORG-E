"""Frame jobs: start in the background, poll for status, serve frames and diffs.

State lives in memory; finished jobs are also written to disk (job.json next to the PNGs)
and loaded again at startup, so a cached job answers instantly even after a restart.
"""

import csv
import hashlib
import json
import logging
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

from . import config, mock
from .errors import ApiError
from .frames import make_frames, mjd_to_date, write_diff_png
from .models import DisplayRange, ErrorDetail, Frame, Grid, Job, JobRequest, Progress, SkyPosition
from .targets import TARGETS

log = logging.getLogger("backend.jobs")

_JOB_ID = re.compile(r"^[0-9a-f]{12}$")
_TARGET_SNAP_DEG = 1e-4  # requests this close to a test target use its exact cache position
TARGET_FOV = 0.1  # the pipeline caches the test targets at this cutout size


# ---------- request -> job id ----------

def normalize(request: JobRequest) -> JobRequest:
    """Snap to a test target position and drop fields that do not change the result."""
    req = request.model_copy()
    if abs(req.fov - TARGET_FOV) < 1e-9:
        for t in TARGETS:
            if abs(req.ra - t.ra) < _TARGET_SNAP_DEG and abs(req.dec - t.dec) < _TARGET_SNAP_DEG:
                req.ra, req.dec = t.ra, t.dec
                break
    if req.mode != "shift_add":
        req.pmra = req.pmdec = None
    return req


def job_id_for(req: JobRequest) -> str:
    key = {
        "ra": round(req.ra, 4), "dec": round(req.dec, 4), "fov": round(req.fov, 3),
        "detector": req.detector, "mode": req.mode,
        "pmra": None if req.pmra is None else round(req.pmra),
        "pmdec": None if req.pmdec is None else round(req.pmdec),
    }
    return hashlib.sha1(json.dumps(key, sort_keys=True).encode()).hexdigest()[:12]


# ---------- cutouts from the pipeline ----------

def _records_from_manifest(directory: Path):
    with open(directory / "manifest.csv", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    return [
        {"path": str(directory / row["file"]), "mjd": float(row["mjd"]),
         "detector": int(row["detector"]), "wavelength_um": float(row["wavelength_um"]),
         "collection": row["collection"], "version": row["version"], "obs_id": row["obs_id"]}
        for row in rows
    ]


LIVE_OFF_MESSAGE = ("Live archive queries are turned off on this server. "
                    "The sample targets still work.")


def cutout_dir(req: JobRequest) -> Path:
    from pipeline.cutouts import _directory  # imported late: heavy, network setup
    return _directory(req.ra, req.dec, req.fov, req.detector)


def is_cached(req: JobRequest) -> bool:
    """True when the cutouts for this request are already in the pipeline cache."""
    return (cutout_dir(req) / "manifest.csv").exists()


def find_cutouts(req: JobRequest, on_progress, live: bool = True):
    """Cutout records for the request and the number of failed downloads.

    A unit that already has a manifest is read straight from the cache: no archive query,
    so cached targets open fast and keep working when IRSA is down. Anything else is
    downloaded through the pipeline, unless live queries are off.
    """
    from pipeline.cutouts import get_cutouts

    directory = cutout_dir(req)
    if not (directory / "manifest.csv").exists():
        if not live:
            raise ApiError("archive_unavailable", LIVE_OFF_MESSAGE)
        get_cutouts(req.ra, req.dec, req.fov, req.detector, on_progress=on_progress)
    records = _records_from_manifest(directory)
    failed_file = directory / "failed.txt"
    failed = len(failed_file.read_text(encoding="utf-8").split()) if failed_file.exists() else 0
    return records, failed


def data_release(records) -> str:
    collections = "+".join(sorted({r["collection"] for r in records}))
    return f"{collections}@{mjd_to_date(max(r['mjd'] for r in records))}"


# ---------- job manager ----------

class JobManager:
    def __init__(self, jobs_dir: Path, max_running: int, live: bool = True):
        self.jobs_dir = jobs_dir
        self.live = live  # False: only cached positions, never the archive
        self.jobs: dict = {}
        self.lock = threading.Lock()
        self.pool = ThreadPoolExecutor(max_running, thread_name_prefix="job")
        self._load_finished()

    def _load_finished(self):
        self.jobs_dir.mkdir(parents=True, exist_ok=True)
        for path in self.jobs_dir.glob("*/job.json"):
            try:
                job = Job.model_validate_json(path.read_text(encoding="utf-8"))
            except ValueError:
                continue
            if job.status == "done":
                self.jobs[job.id] = job

    def submit(self, request: JobRequest) -> Job:
        req = normalize(request)
        job_id = job_id_for(req)
        with self.lock:
            job = self.jobs.get(job_id)
            if job is not None and job.status != "failed":
                return job.model_copy(deep=True)
        if not self.live and not is_cached(req):
            raise ApiError("archive_unavailable", LIVE_OFF_MESSAGE)
        with self.lock:
            job = self.jobs.get(job_id)  # another request may have started it meanwhile
            if job is not None and job.status != "failed":
                return job.model_copy(deep=True)
            job = Job(id=job_id, status="queued", progress=Progress(total=0, done=0, failed=0),
                      center=SkyPosition(ra=req.ra, dec=req.dec))
            self.jobs[job_id] = job
            snapshot = job.model_copy(deep=True)
        self.pool.submit(self._run, job_id, req)
        return snapshot

    def get(self, job_id: str) -> Job:
        with self.lock:
            job = self.jobs.get(job_id)
            if job is None:
                raise ApiError("not_found", f"No job with id '{job_id}'.")
            return job.model_copy(deep=True)

    def _update(self, job_id, **fields):
        with self.lock:
            job = self.jobs[job_id]
            for name, value in fields.items():
                setattr(job, name, value)

    def _fail(self, job_id, code, message):
        log.warning("job %s failed: %s %s", job_id, code, message)
        self._update(job_id, status="failed", error=ErrorDetail(code=code, message=message))

    def _run(self, job_id: str, req: JobRequest):
        self._update(job_id, status="running")

        def on_progress(done, total, failed):
            self._update(job_id, progress=Progress(total=total, done=done, failed=failed))

        try:
            records, failed = find_cutouts(req, on_progress, self.live)
        except ApiError as exc:
            return self._fail(job_id, exc.code, exc.message)
        except Exception as exc:  # archive errors come in many types (HTTP, DAL, timeouts)
            log.exception("cutout search failed for job %s", job_id)
            return self._fail(job_id, "archive_unavailable", f"The SPHEREx archive did not answer: {exc}")
        if not records:
            return self._fail(job_id, "no_coverage", "SPHEREx has no images of this position in this detector yet.")

        total = len(records) + failed
        self._update(job_id, progress=Progress(total=total, done=len(records), failed=failed),
                     data_release=data_release(records))
        out_dir = self.jobs_dir / job_id
        try:
            result = make_frames(records, req.ra, req.dec, req.fov, req.mode, req.pmra, req.pmdec,
                                 config.CENTER_EPOCH, out_dir)
        except Exception as exc:
            log.exception("frame making failed for job %s", job_id)
            return self._fail(job_id, "internal_error", f"Could not build frames: {exc}")
        if not result["frames"]:
            return self._fail(job_id, "no_coverage", "No usable SPHEREx images at this position.")

        frames = [Frame(url=f"/api/frames/{job_id}/{f['n']}.png", **f) for f in result["frames"]]
        self._update(
            job_id, status="done", grid=Grid(**result["grid"]),
            display_range=DisplayRange(**result["display_range"]), frames=frames,
            progress=Progress(total=total, done=len(records), failed=failed + result["n_unreadable"]),
        )
        job = self.get(job_id)
        (out_dir / "job.json").write_text(job.model_dump_json(indent=1), encoding="utf-8")
        log.info("job %s done: %d frames", job_id, len(frames))


manager = JobManager(config.JOBS_DIR, config.MAX_RUNNING_JOBS, live=config.LIVE_QUERIES)


# ---------- HTTP ----------

MOCK_IDS = {"mock", "mock-running", "mock-error"}

router = APIRouter(prefix="/api")


def _job_dir(job_id: str) -> Path:
    if not _JOB_ID.match(job_id):
        raise ApiError("not_found", f"No job with id '{job_id}'.")
    return config.JOBS_DIR / job_id


@router.post("/jobs", response_model=Job)
def create_job(request: JobRequest):
    return manager.submit(request)


@router.get("/jobs/{job_id}", response_model=Job)
def get_job(job_id: str):
    if job_id in MOCK_IDS:
        return mock.get_mock_job(job_id)
    return manager.get(job_id)


@router.get("/frames/{job_id}/{n}.png")
def get_frame(job_id: str, n: int):
    if job_id in MOCK_IDS:
        return mock.frame_file(n)
    path = _job_dir(job_id) / f"{n}.png"
    if not path.exists():
        raise ApiError("not_found", f"Frame {n} of job '{job_id}' does not exist.")
    return FileResponse(path, media_type="image/png")


@router.get("/diff")
def get_diff(job: str, a: int, b: int):
    if job in MOCK_IDS:
        return mock.diff_file()
    state = manager.get(job)
    if state.status != "done":
        raise ApiError("bad_input", "The job is not finished yet.")
    if not (0 <= a < len(state.frames) and 0 <= b < len(state.frames)):
        raise ApiError("bad_input", f"Frames must be between 0 and {len(state.frames) - 1}.")
    directory = _job_dir(job)
    path = directory / f"diff_{a}_{b}.png"
    if not path.exists():
        write_diff_png(directory / "stacks.npz", a, b, path)
    return FileResponse(path, media_type="image/png")
