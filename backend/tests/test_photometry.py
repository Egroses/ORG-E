import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.photometry import position_at
from app.targets import TARGETS_BY_KEY

client = TestClient(app)
BARNARD = TARGETS_BY_KEY["barnard"]
HAS_BARNARD = (config.REPO_ROOT / "cache" / "barnard" / "D6" / "manifest.csv").exists()
needs_cache = pytest.mark.skipif(not HAS_BARNARD, reason="needs cache/barnard/D6 from the pipeline")


def test_position_follows_proper_motion():
    # one year after 2026.0 Barnard's Star is ~10.4 arcsec further north
    ra, dec = position_at(BARNARD.ra, BARNARD.dec, BARNARD.pmra, BARNARD.pmdec, 61406.25, 2026.0)
    assert 10.0 < (dec - BARNARD.dec) * 3600 < 10.7
    assert position_at(1.0, 2.0, None, None, 61000, 2026.0) == (1.0, 2.0)


def test_no_coverage_where_nothing_is_cached():
    r = client.get("/api/spectrum", params={"ra": 12.3, "dec": -45.6})
    assert r.status_code == 404 and r.json()["error"]["code"] == "no_coverage"


def test_bad_position():
    assert client.get("/api/spectrum", params={"ra": 500, "dec": 0}).json()["error"]["code"] == "bad_input"


@needs_cache
def test_barnard_spectrum():
    params = {"ra": BARNARD.ra, "dec": BARNARD.dec, "pmra": BARNARD.pmra, "pmdec": BARNARD.pmdec}
    points = client.get("/api/spectrum", params=params).json()
    waves = [p["wavelength_um"] for p in points]
    assert waves == sorted(waves) and 0.7 < waves[0] and waves[-1] < 5.1
    d6 = [p for p in points if p["detector"] == 6]  # cached for every setup of the cache
    assert len(d6) >= 50 and all(4.3 < p["wavelength_um"] < 5.1 for p in d6)
    assert min(p["flux_mjy"] for p in d6) > 1000  # a few Jy at 4.5 micron
    assert all(p["flagged"] for p in d6)  # saturated core


@needs_cache
def test_moving_star_is_lost_without_proper_motion():
    # at its Gaia 2016.0 position Barnard's Star is gone: ~100 arcsec away by 2025-26.
    # Single flagged exposures can still show artefacts, so only unflagged points count.
    points = client.get("/api/spectrum", params={"ra": 269.4485025, "dec": 4.7394201}).json()
    clean = [abs(p["flux_mjy"]) for p in points if not p["flagged"]]
    assert len(clean) >= 20 and max(clean) < 100


@needs_cache
def test_lightcurve_sorted_and_band_filter():
    params = {"ra": BARNARD.ra, "dec": BARNARD.dec, "pmra": BARNARD.pmra, "pmdec": BARNARD.pmdec,
              "detector": 6, "wl_min": 4.6, "wl_max": 4.8}
    points = client.get("/api/lightcurve", params=params).json()
    assert points and all(4.6 <= p["wavelength_um"] <= 4.8 for p in points)
    mjds = [p["mjd"] for p in points]
    assert mjds == sorted(mjds)
    other = client.get("/api/lightcurve", params={**params, "detector": 1})
    assert other.json()["error"]["code"] == "no_coverage"
