import time

import pytest
from fastapi.testclient import TestClient

from app import config, jobs
from app.jobs import JobManager, job_id_for, normalize
from app.main import app
from app.models import JobRequest
from app.targets import TARGETS_BY_KEY

client = TestClient(app)
BARNARD = TARGETS_BY_KEY["barnard"]


def wait(manager, job_id, timeout=120):
    end = time.time() + timeout
    while time.time() < end:
        job = manager.get(job_id)
        if job.status in ("done", "failed"):
            return job
        time.sleep(0.2)
    raise AssertionError("job did not finish")


def test_normalize_snaps_to_target():
    req = normalize(JobRequest(ra=BARNARD.ra + 5e-5, dec=BARNARD.dec - 5e-5, fov=0.1))
    assert (req.ra, req.dec) == (BARNARD.ra, BARNARD.dec)
    other_fov = normalize(JobRequest(ra=BARNARD.ra + 5e-5, dec=BARNARD.dec, fov=0.2))
    assert other_fov.ra != BARNARD.ra


def test_job_id_stable_and_ignores_pm_in_epoch_mode():
    a = job_id_for(normalize(JobRequest(ra=10, dec=20)))
    b = job_id_for(normalize(JobRequest(ra=10.00001, dec=20, pmra=5, pmdec=5)))
    c = job_id_for(normalize(JobRequest(ra=10, dec=20, detector=5)))
    assert a == b and a != c and len(a) == 12


def test_no_coverage(tmp_path, monkeypatch):
    monkeypatch.setattr(jobs, "find_cutouts", lambda req, cb: ([], 0))
    manager = JobManager(tmp_path, 1)
    job = wait(manager, manager.submit(JobRequest(ra=1, dec=2)).id)
    assert job.status == "failed" and job.error.code == "no_coverage"


def test_archive_down(tmp_path, monkeypatch):
    def down(req, cb):
        raise ConnectionError("503")
    monkeypatch.setattr(jobs, "find_cutouts", down)
    manager = JobManager(tmp_path, 1)
    job = wait(manager, manager.submit(JobRequest(ra=1, dec=2)).id)
    assert job.status == "failed" and job.error.code == "archive_unavailable"


def test_unknown_job_and_bad_ids():
    assert client.get("/api/jobs/0123456789ab").json()["error"]["code"] == "not_found"
    assert client.get("/api/frames/..%2F..%2Fsecret/0.png").status_code == 404


BARNARD_CACHE = config.REPO_ROOT / "cache" / "barnard" / "D6" / "manifest.csv"


@pytest.mark.skipif(not BARNARD_CACHE.exists(), reason="needs cache/barnard/D6 from the pipeline")
def test_barnard_end_to_end(tmp_path):
    manager = JobManager(tmp_path, 1)
    job = wait(manager, manager.submit(JobRequest(ra=BARNARD.ra, dec=BARNARD.dec)).id)
    assert job.status == "done", job.error
    assert len(job.frames) >= 3
    assert job.data_release and job.display_range and job.grid.width == 117
    assert (tmp_path / job.id / "0.png").exists() and (tmp_path / job.id / "job.json").exists()

    # a second manager (restart) answers from disk without running anything
    again = JobManager(tmp_path, 1).submit(JobRequest(ra=BARNARD.ra, dec=BARNARD.dec))
    assert again.status == "done" and again.id == job.id
