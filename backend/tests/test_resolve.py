import math
import os

import pytest
from fastapi.testclient import TestClient

from app import resolve as resolve_module
from app.main import app
from app.resolve import SimbadUnavailable, propagate
from app.targets import CATALOG, TARGETS_BY_KEY

client = TestClient(app)


def get(q):
    return client.get("/api/resolve", params={"q": q})


@pytest.mark.parametrize("key", list(CATALOG))
def test_catalog_propagates_to_pipeline_position(key):
    entry, target = CATALOG[key], TARGETS_BY_KEY[key]
    ra, dec = propagate(entry["ra_j2000"], entry["dec_j2000"], entry["pmra"], entry["pmdec"],
                        entry["parallax"], 2000.0, 2026.0)
    # 0.5 arcsec = 0.08 SPHEREx pixel
    assert abs(dec - target.dec) * 3600 < 0.5
    assert abs(ra - target.ra) * 3600 * math.cos(math.radians(dec)) < 0.5


@pytest.mark.parametrize("q", ["Barnard's Star", "barnards star", "GJ 699", "  BARNARD  "])
def test_target_names(q):
    body = get(q).json()
    assert body["source"] == "targets" and body["name"] == "Barnard's Star"
    assert abs(body["current"]["ra"] - 269.446) < 0.001 and abs(body["current"]["dec"] - 4.768) < 0.001
    assert body["catalog"]["epoch"] == 2000.0 and body["pmdec"] > 10000


def test_wise_alias():
    body = get("WISE 0855-0714").json()
    assert body["source"] == "targets" and abs(body["current"]["ra"] - 133.760) < 0.001


def test_sexagesimal_matches_degrees():
    expected = get("269.452083 4.693333").json()["current"]
    for q in ["17h57m48.5s +04d41m36s", "17:57:48.5 +04:41:36", "17 57 48.5 +04 41 36",
              "17:57:48.5, +04:41:36"]:
        body = get(q).json()
        assert body["source"] == "coordinates", q
        assert abs(body["current"]["ra"] - expected["ra"]) < 1e-5, q
        assert abs(body["current"]["dec"] - expected["dec"]) < 1e-5, q


def test_degrees_with_comma_and_negative_dec():
    body = get("133.76, -7.242").json()
    assert body["current"] == {"ra": 133.76, "dec": -7.242, "epoch": 2026.0}
    assert body["pmra"] is None


@pytest.mark.parametrize("q", ["400 10", "10 95", "12:99:00 +04:00:00", "   "])
def test_bad_input(q):
    r = get(q)
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_input"


def test_simbad_found(monkeypatch):
    monkeypatch.setattr(resolve_module, "lookup_simbad", lambda name: {
        "name": "M  31", "ra": 10.684708, "dec": 41.26875, "pmra": None, "pmdec": None, "parallax": None})
    body = get("M 31").json()
    assert body["source"] == "simbad" and body["current"]["ra"] == 10.684708


def test_simbad_not_found(monkeypatch):
    monkeypatch.setattr(resolve_module, "lookup_simbad", lambda name: None)
    r = get("no such star")
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"


def test_simbad_down(monkeypatch):
    def down(name):
        raise SimbadUnavailable("down")
    monkeypatch.setattr(resolve_module, "lookup_simbad", down)
    r = get("Vega")
    assert r.status_code == 503 and r.json()["error"]["code"] == "archive_unavailable"


@pytest.mark.skipif(not os.environ.get("NETWORK_TESTS"), reason="set NETWORK_TESTS=1 to query SIMBAD")
def test_simbad_live():
    body = get("Vega").json()
    assert body["source"] == "simbad" and body["name"] == "* alf Lyr" and body["pmra"] > 100
    assert get("definitely not a star 12345x").json()["error"]["code"] == "not_found"
