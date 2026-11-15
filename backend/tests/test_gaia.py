import os

import pytest
import requests
from fastapi.testclient import TestClient

from app import gaia as gaia_module
from app.main import app
from app.targets import TARGETS_BY_KEY

client = TestClient(app)
BARNARD = TARGETS_BY_KEY["barnard"]
BARNARD_ID = "4472832130942575872"

NO_PM_ROW = {"source_id": "1", "ra": "10.01", "dec": "10.0", "phot_g_mean_mag": "18.0", "pmra": "", "pmdec": ""}


def archive_down(*args):
    raise requests.ConnectionError("down")


def test_target_field_is_answered_without_any_archive(monkeypatch):
    monkeypatch.setattr(gaia_module, "_query", archive_down)
    body = client.get("/api/gaia", params={"ra": BARNARD.ra, "dec": BARNARD.dec}).json()
    star = body[0]  # brightest first
    assert star["source_id"] == BARNARD_ID and len(body) == 477  # GAVO count, 0.075 deg, G < 19
    # moved from 2016.0 to 2026.0: matches the pipeline's 2026.0 position to well under a SPHEREx pixel
    assert abs(star["dec"] - BARNARD.dec) * 3600 < 0.5 and abs(star["ra"] - BARNARD.ra) * 3600 < 0.5
    # the frontend's 0.25 deg field asks for radius 0.1875: still inside the stored field
    wide = client.get("/api/gaia", params={"ra": BARNARD.ra, "dec": BARNARD.dec, "radius": 0.1875, "limit": 2000})
    assert wide.status_code == 200 and len(wide.json()) > len(body)
    faint = client.get("/api/gaia", params={"ra": BARNARD.ra, "dec": BARNARD.dec, "gmag_max": 12})
    assert all(s["gmag"] < 12 for s in faint.json()) and faint.json()[0]["source_id"] == BARNARD_ID


def test_outside_the_stored_fields_goes_live(monkeypatch):
    calls = []
    monkeypatch.setattr(gaia_module, "_query", lambda *args: calls.append(args) or (NO_PM_ROW,))
    body = client.get("/api/gaia", params={"ra": 10, "dec": 10}).json()
    assert body[0]["ra"] == 10.01 and body[0]["pmra"] is None and len(calls) == 1
    client.get("/api/gaia", params={"ra": BARNARD.ra, "dec": BARNARD.dec, "radius": 0.3})  # larger than the field
    client.get("/api/gaia", params={"ra": BARNARD.ra, "dec": BARNARD.dec, "gmag_max": 20})  # fainter than the field
    assert len(calls) == 3


def test_falls_back_to_the_mirror_when_esa_is_down(monkeypatch):
    asked = []

    def fake_get(url, timeout, params):
        asked.append(url)
        if "esac" in url:
            raise requests.ConnectTimeout("ESA down")
        response = requests.Response()
        response.status_code = 200
        response._content = b"source_id,ra,dec,phot_g_mean_mag,pmra,pmdec\n1,10.01,10.0,18.0,,\n"
        return response

    monkeypatch.setattr(gaia_module.requests, "get", fake_get)
    rows = gaia_module.query_services(10, 10, 0.05, 19, 10)
    assert rows[0]["source_id"] == "1" and "esac" in asked[0] and "heidelberg" in asked[1]


def test_bad_radius():
    r = client.get("/api/gaia", params={"ra": 1, "dec": 2, "radius": 3})
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_input"


def test_archive_down(monkeypatch):
    monkeypatch.setattr(gaia_module, "_query", archive_down)
    r = client.get("/api/gaia", params={"ra": 1, "dec": 2})
    assert r.status_code == 503 and r.json()["error"]["code"] == "archive_unavailable"


@pytest.mark.skipif(not os.environ.get("NETWORK_TESTS"), reason="set NETWORK_TESTS=1 to query Gaia")
def test_gaia_live():
    rows = gaia_module.query_services(BARNARD.ra, BARNARD.dec, 0.05, 19, 5)
    assert len(rows) == 5 and rows[0]["source_id"] == BARNARD_ID
