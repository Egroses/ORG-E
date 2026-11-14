from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import app, mount_frontend
from app.prebuild import target_requests


def test_health():
    body = TestClient(app).get("/api/health").json()
    assert body["status"] == "ok" and "jobs" in body["real"]


def test_frontend_served_when_built(tmp_path):
    (tmp_path / "index.html").write_text("<h1>blink</h1>", encoding="utf-8")
    test_app = FastAPI()

    @test_app.get("/api/ping")
    def ping():
        return {"ok": True}

    assert mount_frontend(test_app, tmp_path)
    client = TestClient(test_app)
    assert "blink" in client.get("/?ra=1&dec=2").text
    assert client.get("/api/ping").json() == {"ok": True}


def test_frontend_missing(tmp_path):
    assert not mount_frontend(FastAPI(), tmp_path)


def test_prebuild_requests_only_cached():
    for key, req in target_requests():
        assert req.fov == 0.1 and 1 <= req.detector <= 6
        if req.mode == "shift_add":
            assert key == "wise0855" and req.pmra is not None
