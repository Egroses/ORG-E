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


def test_large_json_is_gzipped():
    # the target list is small; the error body too: only answers over 1000 bytes are compressed
    client = TestClient(app)
    r = client.get("/openapi.json", headers={"Accept-Encoding": "gzip"})
    assert r.headers.get("content-encoding") == "gzip" and r.json()["openapi"]
    small = client.get("/api/health", headers={"Accept-Encoding": "gzip"})
    assert "content-encoding" not in small.headers


def test_nan_becomes_internal_error_json():
    from app.errors import install_error_handlers

    test_app = FastAPI()
    install_error_handlers(test_app)

    @test_app.get("/nan")
    def nan():
        return {"noise": float("nan")}

    r = TestClient(test_app, raise_server_exceptions=False).get("/nan")
    assert r.status_code == 500 and r.json()["error"]["code"] == "internal_error"


def test_archive_message_is_short_and_readable():
    from app.errors import archive_message
    page = ("Unable to access the capabilities endpoint at:\n- https://irsa.ipac.caltech.edu/SIA/capabilities: "
            "HTTP Code: 502 Proxy Error Response body: <!DOCTYPE HTML><html><body><h1>Proxy Error</h1></body></html>")
    message = archive_message(Exception(page))
    assert "HTTP 502" in message and "<" not in message and len(message) < 200
    assert archive_message(TimeoutError("read timed out")) == "The SPHEREx archive did not answer: read timed out"
