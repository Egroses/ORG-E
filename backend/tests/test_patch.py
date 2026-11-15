"""GET /api/patch (docs/patch-api.md).

Most tests use a stand-in imaging module, so they run without imaging/ and without the cache;
the last one runs the real imaging package on the cached Barnard's Star cutouts.
"""

import base64
import gzip
import importlib.util
import sys
import time
import types

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import config, patch
from app.main import app
from app.patch import PatchManager, find_target, parse, patch_id
from app.targets import TARGETS_BY_KEY

client = TestClient(app)
BARNARD = TARGETS_BY_KEY["barnard"]


class FakePatch:
    def __init__(self, epochs):
        self.epochs = epochs
        self.warnings = []


@pytest.fixture
def fake(tmp_path, monkeypatch):
    """A PatchManager on tmp_path with a stand-in imaging and a fake cache for every detector."""
    calls = []
    module = types.ModuleType("imaging")

    def make_patch(records, ra, dec, fov, gap, span, progress=None):
        calls.append(sorted(records))
        time.sleep(0.3)  # long enough to see the 202 answer
        return FakePatch([{"index": 0}] if all(records.values()) else [])

    module.make_patch = make_patch
    module.encode_patch = lambda p, job_id: {"contract": 1, "status": "done", "id": job_id,
                                             "epochs": p.epochs, "warnings": p.warnings}
    monkeypatch.setitem(sys.modules, "imaging", module)
    monkeypatch.setattr(patch, "imaging_available", lambda: True)

    cache = tmp_path / "cache"
    for det in range(1, 7):
        (cache / f"D{det}").mkdir(parents=True)
        (cache / f"D{det}" / "manifest.csv").write_text(
            "file,mjd,detector,wavelength_um,collection,version,obs_id\n"
            f"a.fits,61000.0,{det},4.5,dr1,1,x\n", encoding="utf-8")
    monkeypatch.setattr(patch, "unit_dir", lambda params, det: cache / f"D{det}")
    manager = PatchManager(tmp_path / "out", live=False)
    monkeypatch.setattr(patch, "manager", manager)
    return types.SimpleNamespace(manager=manager, calls=calls, cache=cache)


def poll(params, timeout=10):
    end = time.time() + timeout
    while time.time() < end:
        r = client.get("/api/patch", params=params)
        if r.status_code != 202:
            return r
        time.sleep(0.1)
    raise AssertionError("patch did not finish")


def test_202_then_200_and_same_id(fake):
    params = {"ra": BARNARD.ra, "dec": BARNARD.dec}
    first = client.get("/api/patch", params=params)
    assert first.status_code == 202 and first.json()["status"] in ("queued", "running")
    assert set(first.json()["progress"]) == {"total", "done", "failed"}
    done = poll(params)
    assert done.status_code == 200 and done.json()["status"] == "done" and done.json()["id"] == first.json()["id"]
    assert fake.calls == [[2, 4, 6]]  # default dets, built once
    poll(params)
    assert len(fake.calls) == 1  # answered from disk


def test_answer_is_sent_gzipped_when_asked(fake):
    params = {"ra": BARNARD.ra, "dec": BARNARD.dec, "dets": "6"}
    poll(params)
    r = client.get("/api/patch", params=params, headers={"Accept-Encoding": "gzip"})
    assert r.headers["content-encoding"] == "gzip" and r.json()["status"] == "done"
    plain = client.get("/api/patch", params=params, headers={"Accept-Encoding": "identity"})
    assert "content-encoding" not in plain.headers and plain.json()["status"] == "done"


@pytest.mark.parametrize("bad", [{"dets": "2,9"}, {"dets": "x"}, {"fov": 0.5}, {"ra": "abc"},
                                 {"gap_days": 0}, {"dec": 95}])
def test_bad_input(fake, bad):
    r = client.get("/api/patch", params={"ra": 10, "dec": 10, **bad})
    assert r.status_code == 400
    assert r.json()["status"] == "failed" and r.json()["error"]["code"] == "bad_input"


def test_snaps_to_a_target_within_10_arcsec():
    near = parse(BARNARD.ra + 5 / 3600, BARNARD.dec - 5 / 3600, 0.1, "2,4,6", 10, 30)
    assert (near["ra"], near["dec"], near["target"]) == (BARNARD.ra, BARNARD.dec, "barnard")
    assert patch_id(near) == patch_id(parse(BARNARD.ra, BARNARD.dec, 0.1, "6,4,2", 10, 30))
    assert find_target(BARNARD.ra, BARNARD.dec + 20 / 3600) is None


def test_live_off_uncached_fails_at_once(fake):
    (fake.cache / "D2" / "manifest.csv").unlink()
    r = client.get("/api/patch", params={"ra": 10, "dec": 10})
    assert r.status_code == 200 and r.json()["status"] == "failed"
    assert r.json()["error"]["code"] == "archive_unavailable" and not fake.calls


def test_live_query_downloads_every_missing_detector(fake, monkeypatch):
    import pipeline.archive
    import pipeline.download

    fake.manager.live = True
    for det in (2, 4):
        (fake.cache / f"D{det}" / "manifest.csv").unlink()
    listings, synced, seen = [], [], []
    image = lambda det, n: types.SimpleNamespace(detector=det, file=f"{det}_{n}.fits")

    def list_images(ra, dec):
        listings.append((ra, dec))
        return [image(2, 0), image(2, 1), image(4, 0), image(6, 0)]

    def sync_unit(directory, ra, dec, size, det, images, label, on_progress=None, source="irsa", workers=3):
        assert source == config.ARCHIVE_SOURCE and workers == (20 if source == "s3" else 3)
        synced.append((det, [i.file for i in images]))
        for n, _ in enumerate(images, 1):
            on_progress(n, len(images), 0)
        (directory / "manifest.csv").write_text(
            "file,mjd,detector,wavelength_um,collection,version,obs_id\n"
            f"a.fits,61000.0,{det},4.5,qr3,1,x\n", encoding="utf-8")
        return {"cached": 0, "downloaded": len(images), "failed": [], "errors": {}}

    monkeypatch.setattr(pipeline.archive, "list_images", list_images)
    monkeypatch.setattr(pipeline.download, "sync_unit", sync_unit)
    original = fake.manager._set
    monkeypatch.setattr(fake.manager, "_set", lambda job_id, **f: (seen.append(f.get("progress")), original(job_id, **f)))

    r = client.get("/api/patch", params={"ra": 10, "dec": 10, "dets": "2,4,6"})
    assert r.status_code == 202  # several detectors are fine now
    assert poll({"ra": 10, "dec": 10, "dets": "2,4,6"}).json()["status"] == "done"
    assert len(listings) == 1  # the archive is listed once for the position
    assert synced == [(2, ["2_0.fits", "2_1.fits"]), (4, ["4_0.fits"])]  # only the missing ones, D6 is cached
    counts = [(p["done"], p["total"]) for p in seen if p and p["total"] == 3]
    assert counts[-1] == (3, 3) and [d for d, _ in counts] == sorted(d for d, _ in counts)  # one run 0 -> 3
    downloads = [p for p in seen if p and "detector_total" in p]
    assert downloads[0]["detector_done"] == 0 and downloads[-1]["detector_done"] == 2
    assert {p["detector_total"] for p in downloads} == {2} and all("eta_s" in p for p in downloads[1:])
    assert fake.calls == [[2, 4, 6]]


def test_no_readable_images_is_no_coverage(fake):
    (fake.cache / "D6" / "manifest.csv").write_text(
        "file,mjd,detector,wavelength_um,collection,version,obs_id\n", encoding="utf-8")
    r = poll({"ra": 10, "dec": 10, "dets": "6"})
    assert r.json()["status"] == "failed" and r.json()["error"]["code"] == "no_coverage"


def test_without_imaging_says_so(tmp_path, monkeypatch):
    monkeypatch.setattr(patch, "imaging_available", lambda: False)
    monkeypatch.setattr(patch, "manager", PatchManager(tmp_path, live=False))
    r = client.get("/api/patch", params={"ra": BARNARD.ra, "dec": BARNARD.dec})
    assert r.json()["status"] == "failed" and r.json()["error"]["code"] == "internal_error"


def test_prebuild_uses_the_frontend_epoch_settings():
    rdra = [p for p in patch.prebuild_requests() if p["target"] == "rdra"]
    assert {(p["gap_days"], p["max_span_days"]) for p in rdra} == {(60.0, 150.0)}
    assert {tuple(p["dets"]) for p in rdra} == {(2, 4, 6), (1, 2, 3, 4, 5, 6)}


# ---------- real data ----------

HAS_REAL = (importlib.util.find_spec("imaging") is not None
            and all((config.REPO_ROOT / "cache" / "barnard" / f"D{d}" / "manifest.csv").exists() for d in (2, 4, 6)))


@pytest.mark.skipif(not HAS_REAL, reason="needs imaging/ and cache/barnard D2, D4, D6")
def test_barnard_contract_on_real_data(tmp_path, monkeypatch):
    monkeypatch.setattr(patch, "manager", PatchManager(tmp_path, live=False))
    r = poll({"ra": BARNARD.ra, "dec": BARNARD.dec, "dets": "2,4,6", "gap_days": 30, "max_span_days": 60},
             timeout=120)
    body = r.json()
    assert r.status_code == 200 and body["status"] == "done", body
    size = body["size"]
    assert [b["detector"] for b in body["bands"]] == [2, 4, 6] and len(body["epochs"]) >= 3
    d6 = [b["detector"] for b in body["bands"]].index(6)
    rows = []
    for row in body["frames"]:
        frame = row[d6]
        data = np.frombuffer(base64.b64decode(frame["data"]), dtype="<f4").reshape(size, size)
        share = np.frombuffer(base64.b64decode(frame["flag_share"]), dtype=np.uint8)
        assert share.size == size * size and (frame["noise"] is None or frame["noise"] > 0)
        # centroid of the brightest 3x3 block around the centre
        c = size // 2
        box = np.nan_to_num(data[c - 8:c + 9, c - 8:c + 9])
        y, x = np.unravel_index(np.argmax(box), box.shape)
        rows.append(c - 8 + y)
    # display order (row 0 = north): Barnard's Star moves north, to smaller rows
    assert rows[-1] < rows[0]
    assert gzip.decompress(patch.manager.result_path(body["id"]).read_bytes())  # stored on disk


def test_failure_is_reported_then_retried_later(fake, monkeypatch):
    (fake.cache / "D6" / "manifest.csv").write_text(
        "file,mjd,detector,wavelength_um,collection,version,obs_id\n", encoding="utf-8")
    params = {"ra": 10, "dec": 10, "dets": "6"}
    assert poll(params).json()["status"] == "failed"
    assert client.get("/api/patch", params=params).json()["status"] == "failed"  # not restarted at once
    monkeypatch.setattr(patch, "RETRY_AFTER_S", -1)
    assert client.get("/api/patch", params=params).status_code == 202  # tried again later


def test_new_data_rebuilds_a_stored_patch(fake):
    params = {"ra": 10, "dec": 10, "dets": "6"}
    assert poll(params).json()["status"] == "done" and len(fake.calls) == 1
    assert poll(params).json()["status"] == "done" and len(fake.calls) == 1  # unchanged: from disk
    with open(fake.cache / "D6" / "manifest.csv", "a", encoding="utf-8") as handle:
        handle.write("b.fits,61100.0,6,4.6,qr3,1,y\n")  # the pipeline added an image
    assert client.get("/api/patch", params=params).status_code == 202
    assert poll(params).json()["status"] == "done" and len(fake.calls) == 2
