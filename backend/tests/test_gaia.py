import os

import pytest
import requests
from fastapi.testclient import TestClient

from app import gaia as gaia_module
from app.main import app
from app.targets import TARGETS_BY_KEY

client = TestClient(app)
BARNARD = TARGETS_BY_KEY["barnard"]

# Barnard's Star as Gaia DR3 gives it (epoch 2016.0)
BARNARD_ROW = {"source_id": "4472832130942575872", "ra": "269.44850252543836", "dec": "4.739420051112412",
               "phot_g_mean_mag": "8.1939745", "pmra": "-801.5509783684709", "pmdec": "10362.394206546573"}
NO_PM_ROW = {"source_id": "1", "ra": "269.5", "dec": "4.7", "phot_g_mean_mag": "18.0", "pmra": "", "pmdec": ""}


def test_propagates_to_2026(monkeypatch):
    monkeypatch.setattr(gaia_module, "_query", lambda *args: (BARNARD_ROW, NO_PM_ROW))
    body = client.get("/api/gaia", params={"ra": BARNARD.ra, "dec": BARNARD.dec}).json()
    star, plain = body
    # matches the pipeline's 2026.0 position to well under a SPHEREx pixel
    assert abs(star["dec"] - BARNARD.dec) * 3600 < 0.5
    assert abs(star["ra"] - BARNARD.ra) * 3600 < 0.5
    assert plain["ra"] == 269.5 and plain["pmra"] is None


def test_bad_radius():
    r = client.get("/api/gaia", params={"ra": 1, "dec": 2, "radius": 3})
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_input"


def test_archive_down(monkeypatch):
    def down(*args):
        raise requests.ConnectionError("down")
    monkeypatch.setattr(gaia_module, "_query", down)
    r = client.get("/api/gaia", params={"ra": 1, "dec": 2})
    assert r.status_code == 503 and r.json()["error"]["code"] == "archive_unavailable"


@pytest.mark.skipif(not os.environ.get("NETWORK_TESTS"), reason="set NETWORK_TESTS=1 to query Gaia")
def test_gaia_live():
    body = client.get("/api/gaia", params={"ra": BARNARD.ra, "dec": BARNARD.dec, "limit": 5}).json()
    assert len(body) == 5 and body[0]["source_id"] == "4472832130942575872"
