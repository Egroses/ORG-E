import requests
from fastapi.testclient import TestClient

from app import catwise as catwise_module
from app.main import app
from app.targets import TARGETS_BY_KEY

client = TestClient(app)
WISE0855 = TARGETS_BY_KEY["wise0855"]
HEADER = "source_name,ra_pm,dec_pm,w1mpro,w2mpro,pmra,pmdec,sigpmra,sigpmdec\n"


def archive_down(*args):
    raise requests.ConnectionError("down")


def test_wise0855_from_the_stored_field_without_any_archive(monkeypatch):
    monkeypatch.setattr(catwise_module, "_query", archive_down)
    body = client.get("/api/catwise", params={"ra": WISE0855.ra, "dec": WISE0855.dec, "radius": 0.005}).json()
    fast = [s for s in body if s["pm_snr"] and s["pm_snr"] > 20]
    # CatWISE splits the fast brown dwarf into pieces along its track; moved to 2026.0 they sit on the target
    assert fast and all(-8500 < s["pmra"] < -7500 for s in fast)  # mas/yr (CatWISE gives arcsec/yr)
    assert all(abs(s["ra"] - WISE0855.ra) * 3600 < 6 and abs(s["dec"] - WISE0855.dec) * 3600 < 6 for s in fast)
    w2 = [s["w2"] for s in body if s["w2"] is not None]
    assert w2 == sorted(w2)  # brightest W2 first


def test_outside_the_fields_goes_live_and_trims_to_the_circle(monkeypatch):
    rows = ({"source_name": "near", "ra_pm": "10.0", "dec_pm": "10.0", "w1mpro": "15", "w2mpro": "14",
             "pmra": "", "pmdec": "", "sigpmra": "", "sigpmdec": ""},
            {"source_name": "far", "ra_pm": "10.5", "dec_pm": "10.0", "w1mpro": "15", "w2mpro": "13",
             "pmra": "0", "pmdec": "0", "sigpmra": "0.01", "sigpmdec": "0.01"})
    monkeypatch.setattr(catwise_module, "_query", lambda *args: rows)
    body = client.get("/api/catwise", params={"ra": 10, "dec": 10, "radius": 0.05}).json()
    assert [s["name"] for s in body] == ["near"] and body[0]["pmra"] is None and body[0]["pm_snr"] is None


def test_falls_back_to_data_lab_when_irsa_fails(monkeypatch):
    asked = []

    def fake_get(url, timeout, params):
        asked.append(url)
        response = requests.Response()
        if "irsa" in url:
            response.status_code, response._content = 502, b"<html>Proxy Error</html>"
        else:
            response.status_code = 200
            response._content = (HEADER + "J1,10.0,10.0,15,14,-1.0,0.5,0.01,0.01\n").encode()
        return response

    monkeypatch.setattr(catwise_module.requests, "get", fake_get)
    rows = catwise_module.query_services(10, 10, 0.05, 10)
    assert rows[0]["source_name"] == "J1" and "irsa" in asked[0] and "datalab" in asked[1]


def test_box_handles_ra_wrap():
    assert "(ra >= 359.95" in catwise_module._box(0.01, 0, 0.05)
    assert "OR ra <=" in catwise_module._box(359.99, 0, 0.05)


def test_bad_input_and_archive_down(monkeypatch):
    assert client.get("/api/catwise", params={"ra": 1, "dec": 2, "radius": 1}).json()["error"]["code"] == "bad_input"
    monkeypatch.setattr(catwise_module, "_query", archive_down)
    r = client.get("/api/catwise", params={"ra": 1, "dec": 2})
    assert r.status_code == 503 and r.json()["error"]["code"] == "archive_unavailable"
