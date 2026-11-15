import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.photometry import CHANNELS_PER_DETECTOR, channel_of, channel_spectrum, position_at
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
    # saturated core: every point a lower limit, but only a minority has a hard bad-pixel bit
    assert all(p["saturated"] and p["lower_limit"] for p in d6)
    assert 0 < sum(p["flagged"] for p in points) < len(points) / 3


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


def point(detector, wavelength, flux, err=1.0, flagged=False, saturated=False):
    return {"detector": detector, "wavelength_um": wavelength, "flux_mjy": flux, "err_mjy": err,
            "flagged": flagged, "saturated": saturated, "lower_limit": saturated}


def test_channels_cover_each_detector_in_17_steps():
    assert channel_of(6, 4.41) == 0 and channel_of(6, 5.009) == CHANNELS_PER_DETECTOR - 1
    assert channel_of(6, 4.0) == 0 and channel_of(6, 6.0) == CHANNELS_PER_DETECTOR - 1  # clamped
    assert [channel_of(1, w) for w in (0.75, 0.9, 1.1)] == sorted(channel_of(1, w) for w in (0.75, 0.9, 1.1))


def test_channel_median_skips_hard_flags_and_reports_empty_channels():
    pts = [point(6, 4.42, 10), point(6, 4.42, 12), point(6, 4.42, 99, flagged=True), point(6, 4.42, 14, saturated=True)]
    channels = channel_spectrum(pts)
    assert len(channels) == 102
    first = channels[5 * CHANNELS_PER_DETECTOR]
    assert (first["detector"], first["index"], first["flux_mjy"]) == (6, 0, 12.0)
    assert first["n_exposures"] == 3 and first["n_skipped"] == 1 and first["saturated"] and first["lower_limit"]
    assert abs(first["err_mjy"] - 1.2533 * 3 ** 0.5 / 3) < 1e-3
    empty = channels[0]
    assert empty["flux_mjy"] is None and empty["err_mjy"] is None and empty["n_exposures"] == 0


def test_bad_aperture():
    r = client.get("/api/spectrum", params={"ra": 10, "dec": 10, "aperture": 5})
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_input"


@needs_cache
def test_barnard_102_channels_and_apertures():
    base = {"ra": BARNARD.ra, "dec": BARNARD.dec, "pmra": BARNARD.pmra, "pmdec": BARNARD.pmdec, "mode": "102"}
    body = client.get("/api/spectrum", params=base).json()
    assert len(body["channels"]) == 102 and body["aperture_px"] == 2 and body["unit"] == "mJy"
    d6 = [c for c in body["channels"] if c["detector"] == 6]
    assert [c["index"] for c in d6] == list(range(17)) and all(c["flux_mjy"] for c in d6)
    waves = [c["wavelength_um"] for c in d6]
    assert waves == sorted(waves) and 4.4 < waves[0] and waves[-1] < 5.01
    assert body["warnings"]  # saturated
    small = client.get("/api/spectrum", params={**base, "aperture": 1}).json()["channels"]
    total = lambda chs: sum(c["flux_mjy"] or 0 for c in chs if c["detector"] == 6)
    assert total(small) < total(d6)  # a larger aperture gathers more light
    assert isinstance(client.get("/api/spectrum", params={k: v for k, v in base.items() if k != "mode"}).json(), list)
