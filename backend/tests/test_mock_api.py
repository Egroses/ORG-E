from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_targets():
    r = client.get("/api/targets")
    assert r.status_code == 200
    keys = [t["key"] for t in r.json()]
    assert keys == ["barnard", "epsindb", "wise0855", "rwaur", "rdra"]
    wise = r.json()[2]
    assert wise["mode"] == "shift_add" and wise["pmra"] is not None


def test_resolve():
    r = client.get("/api/resolve", params={"q": "Barnard's Star"})
    assert r.status_code == 200
    body = r.json()
    assert abs(body["current"]["ra"] - 269.446) < 0.01
    assert abs(body["current"]["dec"] - 4.768) < 0.01


def test_create_and_get_job():
    r = client.post("/api/jobs", json={"ra": 269.446, "dec": 4.768})
    assert r.status_code == 200
    job = r.json()
    assert job["status"] == "done"
    assert len(job["frames"]) == 3
    assert job["data_release"] and job["display_range"]["stretch"] == "asinh"
    assert job["grid"]["width"] == 117

    r = client.get(f"/api/jobs/{job['id']}")
    assert r.json() == job


def test_frame_png():
    job = client.get("/api/jobs/mock").json()
    for frame in job["frames"]:
        r = client.get(frame["url"])
        assert r.status_code == 200
        assert r.headers["content-type"] == "image/png"
    assert client.get("/api/frames/mock/9.png").json()["error"]["code"] == "not_found"


def test_mock_running():
    job = client.get("/api/jobs/mock-running").json()
    assert job["status"] == "running"
    assert job["progress"]["done"] == 1 and len(job["frames"]) == 1


def test_mock_error():
    r = client.get("/api/jobs/mock-error")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "no_coverage"


def test_bad_input():
    r = client.post("/api/jobs", json={"ra": 400, "dec": 4.7})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "bad_input"

    r = client.post("/api/jobs", json={"ra": 133.76, "dec": -7.24, "mode": "shift_add"})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "bad_input"


def test_diff_and_analysis():
    assert client.get("/api/diff", params={"job": "mock", "a": 0, "b": 2}).status_code == 200
    assert len(client.get("/api/spectrum", params={"ra": 1, "dec": 2}).json()) == 102
    assert client.get("/api/lightcurve", params={"ra": 1, "dec": 2}).status_code == 200
    assert client.get("/api/gaia", params={"ra": 1, "dec": 2}).status_code == 200
