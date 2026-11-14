"""Synthetic unit tests (no data cache needed) plus the checks against astropy / scipy.
AI-assisted code (Claude Code)."""
import base64
import json
import warnings

import numpy as np
import pytest

from imaging import core, encode_patch, make_patch
from imaging.fitsread import read_hdus
from imaging.patch import Patch, PatchFrame, decode_frame, epoch_labels, format_dates
from imaging.tanwcs import TanWCS


def first_cutout_path(cache, target="barnard", det=6):
    from imaging.records import load_records
    return load_records(cache, target, det)[0]["path"]


# ---------- WCS, reader, resampling ----------

def test_tanwcs_matches_astropy_on_real_cutout(cache):
    from astropy.io import fits
    from astropy.wcs import WCS
    path = first_cutout_path(cache)
    with fits.open(path, memmap=False) as hdul, warnings.catch_warnings():
        warnings.simplefilter("ignore")
        header, (ny, nx) = hdul["IMAGE"].header, hdul["IMAGE"].data.shape
        astro = WCS(header)
    mine = TanWCS.from_header(header)
    xs, ys = np.meshgrid(np.linspace(0, nx - 1, 9), np.linspace(0, ny - 1, 9))
    ra, dec = astro.all_pix2world(xs, ys, 0)
    xb, yb = mine.world2pix(ra, dec)
    assert np.max(np.hypot(xb - xs, yb - ys)) < 0.01
    ra2, dec2 = mine.pix2world(xs, ys)
    sep = np.hypot((ra2 - ra) * np.cos(np.radians(dec)), dec2 - dec) * 3600 / 6.15  # native pixels
    assert sep.max() < 0.01


def test_world2pix_grid_matches_exact(cache):
    cut = core.load_cutout(first_cutout_path(cache, "rdra", 4))
    grid, n = core.make_grid(248.167233, 66.755024, 0.1)
    ra, dec = core.grid_world(grid, n)
    x, y = cut.wcs.world2pix(ra, dec)
    xc, yc = core.world2pix_grid(cut.wcs, ra, dec)
    assert max(np.abs(x - xc).max(), np.abs(y - yc).max()) < 0.01


def test_fits_reader_matches_astropy(cache):
    from astropy.io import fits
    path = first_cutout_path(cache)
    hdus = read_hdus(path, ("IMAGE", "FLAGS", "ZODI"))
    with fits.open(path, memmap=False) as hdul:
        for name in ("IMAGE", "FLAGS", "ZODI"):
            np.testing.assert_array_equal(hdus[name][1], hdul[name].data)
        header = hdul["IMAGE"].header
        for key in ("CRVAL1", "CRPIX2", "CD1_1", "A_ORDER", "CTYPE1"):
            if key in header:
                assert hdus["IMAGE"][0][key] == header[key]
        mskn = {k: v for k, v in hdul["FLAGS"].header.items() if k.startswith("MSKN")}
        assert mskn and all(hdus["FLAGS"][0][k] == v for k, v in mskn.items())


def test_load_cutout_keeps_saturated_cores(cache):
    # The Barnard star core carries OVERFLOW/SUR_ERROR/BLOOM and must not become a NaN hole.
    from imaging.records import load_records
    worst = 0.0
    for rec in load_records(cache, "barnard", 6)[:20]:
        cut = core.load_cutout(rec["path"])
        cy, cx = cut.image.shape[0] // 2, cut.image.shape[1] // 2
        worst = max(worst, float(np.isnan(cut.image[cy - 1:cy + 2, cx - 3:cx + 4]).mean()))
    assert worst < 0.5


def test_bilinear_matches_scipy():
    ndimage = pytest.importorskip("scipy.ndimage")
    rng = np.random.default_rng(1)
    image = rng.normal(size=(30, 37))
    x = rng.uniform(-2, 38, 5000)
    y = rng.uniform(-2, 31, 5000)
    mine = core.bilinear(image, x, y)
    ref = ndimage.map_coordinates(image, [y, x], order=1, mode="constant", cval=np.nan)
    assert np.array_equal(np.isnan(mine), np.isnan(ref))
    ok = np.isfinite(ref)
    assert ok.sum() > 3000
    np.testing.assert_allclose(mine[ok], ref[ok], atol=1e-12)


def test_bilinear_nan_neighbour_gives_nan():
    image = np.ones((5, 5))
    image[2, 2] = np.nan
    out = core.bilinear(image, np.array([1.5, 3.5, 2.0]), np.array([1.5, 3.5, 2.0]))
    assert np.isnan(out[0]) and np.isfinite(out[1]) and np.isnan(out[2])


def make_synthetic_cutout(ra0, dec0, offsets_arcsec, size=59, scale=6.15):
    """Flat cutout with one bright pixel per (east, north) arcsec offset; north up, east left."""
    s = scale / 3600.0
    wcs = TanWCS((ra0, dec0), ((size + 1) / 2, (size + 1) / 2), [[-s, 0.0], [0.0, s]])
    image = np.zeros((size, size))
    for east, north in offsets_arcsec:
        x = (size - 1) / 2 - east / scale
        y = (size - 1) / 2 + north / scale
        image[int(round(y)), int(round(x))] = 100.0
    return core.Cutout(image, np.zeros_like(image, dtype=bool), wcs, 0.0)


def test_orientation_north_is_up_east_is_left():
    ra0, dec0 = 120.0, 20.0
    cut = make_synthetic_cutout(ra0, dec0, [(0, 30.75), (30.75, 0)])   # 30.75" north, 30.75" east
    grid, n = core.make_grid(ra0, dec0, 0.1)
    gra, gdec = core.grid_world(grid, n)
    image, _, _ = core.resample_cutout(cut, gra, gdec)
    c = (n - 1) // 2
    rows = np.arange(n)[:, None]
    peak_north = np.unravel_index(np.nanargmax(np.where(rows > c + 3, image, -1)), image.shape)
    assert peak_north[0] > c                       # FITS order: north = larger row
    peak_east = np.unravel_index(np.nanargmax(np.where((rows >= c - 3) & (rows <= c + 3), image, -1)), image.shape)
    assert peak_east[1] < c                        # east = smaller column (east left)


# ---------- epochs and stacking ----------

def test_split_epochs_gap_and_max_span():
    recs = [{"mjd": m} for m in [0, 1, 2, 20, 21, 22]]
    assert [len(g) for g in core.split_epochs(recs, gap_days=10, max_span_days=30)] == [3, 3]
    continuous = [{"mjd": float(m)} for m in range(0, 100, 2)]     # no gap anywhere
    assert len(core.split_epochs(continuous, gap_days=10, max_span_days=1e9)) == 1
    capped = core.split_epochs(continuous, gap_days=10, max_span_days=30)
    assert len(capped) == 4
    assert all(g[-1]["mjd"] - g[0]["mjd"] <= 30 for g in capped)
    assert sum(len(g) for g in capped) == len(continuous)
    assert [r["mjd"] for r in core.split_epochs([{"mjd": 5}, {"mjd": 1}])[0]] == [1, 5]   # sorted first


def test_clipped_stack_rejects_outlier():
    rng = np.random.default_rng(2)
    cube = rng.normal(10.0, 0.1, size=(8, 6, 6))
    cube[3, 2, 2] = 1000.0
    assert abs(core.stack_images(cube, clip=True)[2, 2] - 10.0) < 0.2
    assert core.stack_images(cube, clip=False)[2, 2] > 100


def test_stack_few_frames_is_plain_mean_and_nan_aware():
    a = np.full((4, 4), 2.0)
    b = np.full((4, 4), 4.0)
    b[0, 0] = np.nan
    out = core.stack_images([a, b], clip=True)
    assert out[1, 1] == 3.0 and out[0, 0] == 2.0
    assert np.isnan(core.stack_images([np.full((2, 2), np.nan)] * 3)).all()


def test_nanmedian0_matches_numpy():
    rng = np.random.default_rng(3)
    cube = rng.normal(size=(7, 50))
    cube[rng.random(cube.shape) < 0.3] = np.nan
    cube[:, 0] = np.nan
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        ref = np.nanmedian(cube, axis=0)
    np.testing.assert_allclose(core._nanmedian0(cube), ref, equal_nan=True)


def test_clipped_median_matches_astropy():
    from astropy.stats import sigma_clipped_stats
    rng = np.random.default_rng(6)
    values = np.concatenate([rng.normal(3.0, 1.0, 3000), rng.normal(50, 5, 100)])
    assert core.clipped_median(values) == pytest.approx(sigma_clipped_stats(values, sigma=3.0)[1], abs=1e-9)


def test_noise_estimate_ignores_centre():
    rng = np.random.default_rng(4)
    img = rng.normal(0, 2.0, size=(61, 61))
    img[25:36, 25:36] = 5000.0       # bright target in the middle
    assert abs(core.noise_estimate(img) - 2.0) < 0.2


def test_flag_share_is_fraction_of_covering_frames():
    flagged = np.zeros((4, 3, 3), bool)
    covered = np.ones((4, 3, 3), bool)
    flagged[:2, 1, 1] = True          # 2 of 4
    covered[:, 0, 0] = False          # never covered -> share 0, not a division error
    share = core.flag_share(flagged, covered)
    assert share.dtype == np.uint8
    assert share[1, 1] == 128 and share[0, 0] == 0 and share[2, 2] == 0
    flagged[:, 2, 2] = True
    assert core.flag_share(flagged, covered)[2, 2] == 255


# ---------- dates and labels ----------

def test_dates_and_labels():
    # MJD 60902 = 2025-08-15, 60950 = 2025-10-02
    assert format_dates(60902.9, 60950.2) == "15 Aug – 2 Oct 2025"
    assert format_dates(60902.1, 60902.9) == "15 Aug 2025"
    assert format_dates(60902.1, 60905.9) == "15 – 18 Aug 2025"
    assert format_dates(61040.0, 61100.0) == "31 Dec 2025 – 1 Mar 2026"     # across a year end
    assert epoch_labels([60910.4]) == ["Aug 2025"]            # MJD 60910 = 23 Aug 2025
    assert len(set(epoch_labels([60910.4, 60915.0]))) == 2    # same month: the day is added


# ---------- patch encode / decode ----------

def synthetic_patch(n=9):
    rng = np.random.default_rng(5)
    f0 = PatchFrame(rng.normal(size=(n, n)).astype(np.float32), rng.integers(0, 256, (n, n)).astype(np.uint8), 0.0123, 3)
    f0.data[0, 0] = np.nan
    f1 = PatchFrame(rng.normal(size=(n, n)).astype(np.float32), np.zeros((n, n), np.uint8), 0.02, 5)
    patch = Patch(120.0, 20.0, 0.1, n, 3.075)
    patch.bands = [{"detector": 2, "wavelength_um": [1.1, 1.62]}, {"detector": 6, "wavelength_um": [4.42, 5.0]}]
    patch.frames = [[f0, None], [None, f1]]
    patch.epochs = [
        {"index": 0, "mjd_start": 60902.8, "mjd_end": 60950.2, "mjd_mean": 60921.4, "label": "Aug 2025",
         "dates": "15 Aug – 2 Oct 2025", "n_images": {2: 3}},
        {"index": 1, "mjd_start": 61000.0, "mjd_end": 61001.0, "mjd_mean": 61000.5, "label": "Nov 2025",
         "dates": "1 – 2 Nov 2025", "n_images": {6: 5}}]
    patch.data_release = {"collections": {"dr1": 8, "qr3": 0, "dr1_deep": 0, "qr3_deep": 0}, "latest_mjd": 61001.0}
    return patch


def test_encode_decode_round_trip_and_flip():
    patch = synthetic_patch()
    payload = json.loads(json.dumps(encode_patch(patch, "abc123")))      # must be JSON-safe
    assert payload["status"] == "done" and payload["id"] == "abc123" and payload["contract"] == 1
    assert payload["size"] == 9 and payload["unit"] == "MJy/sr"
    assert payload["orientation"] == "row 0 = north, column 0 = east"
    assert payload["epochs"][0]["n_images"] == {"2": 3}
    assert payload["frames"][0][1] is None and payload["frames"][1][0] is None
    f = payload["frames"][0][0]
    assert f["noise"] == pytest.approx(0.0123) and f["n_images"] == 3
    assert len(base64.b64decode(f["data"])) == 9 * 9 * 4
    assert len(base64.b64decode(f["flag_share"])) == 9 * 9
    data, share = decode_frame(payload, 0, 0)
    src = patch.frames[0][0]
    np.testing.assert_array_equal(data, np.flipud(src.data))              # display order: rows flipped
    np.testing.assert_array_equal(share, np.flipud(src.flag_share))
    assert np.isnan(data[-1, 0])                                           # NaN kept; FITS row 0 is now last
    assert share.dtype == np.uint8


# ---------- end to end on synthetic FITS files ----------

def write_fits(path, north_arcsec, ra0, dec0, seed, hot_pixel=False):
    from astropy.io import fits
    size, scale = 59, 6.15
    s = scale / 3600.0
    yy, xx = np.indices((size, size))
    x = (size - 1) / 2
    y = (size - 1) / 2 + north_arcsec / scale
    rng = np.random.default_rng(seed)
    image = 50.0 + rng.normal(0, 0.5, (size, size)) + 300 * np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / 2.0)
    flags = np.zeros((size, size), np.int32)
    if hot_pixel:
        flags[5, 5] = 1 << 10
    header = fits.Header()
    for k, v in dict(CTYPE1="RA---TAN", CTYPE2="DEC--TAN", CRVAL1=ra0, CRVAL2=dec0, CRPIX1=(size + 1) / 2,
                     CRPIX2=(size + 1) / 2, CD1_1=-s, CD1_2=0.0, CD2_1=0.0, CD2_2=s).items():
        header[k] = v
    flag_header = fits.Header()
    flag_header["MSKN00"] = "TRANSIENT"
    flag_header["MSKN10"] = "HOT"
    fits.HDUList([fits.PrimaryHDU(),
                  fits.ImageHDU(image.astype(np.float32), header=header, name="IMAGE"),
                  fits.ImageHDU(flags, header=flag_header, name="FLAGS"),
                  fits.ImageHDU(np.zeros((size, size), np.float32), name="VARIANCE"),
                  fits.ImageHDU(np.full((size, size), 40.0, np.float32), name="ZODI")]).writeto(path, overwrite=True)


def test_make_patch_synthetic_end_to_end(tmp_path):
    ra0, dec0 = 150.0, 10.0
    records = {2: [], 6: []}
    # epoch A: 3 exposures per detector, star 20" north; epoch B 100 days later: 2 exposures, star 40" north
    plan = [(60000.0, 20), (60000.1, 20), (60000.2, 20), (60100.0, 40), (60100.1, 40)]
    for det in (2, 6):
        for k, (mjd, north) in enumerate(plan):
            path = tmp_path / f"d{det}_{k}.fits"
            write_fits(path, north, ra0, dec0, seed=det * 10 + k, hot_pixel=(k == 0))
            records[det].append({"path": str(path), "mjd": mjd, "detector": det, "wavelength_um": 1.0,
                                 "collection": "dr1", "version": "x", "obs_id": f"{det}{k}"})
    records[6].append({"path": str(tmp_path / "missing.fits"), "mjd": 60000.3, "detector": 6,
                       "wavelength_um": 1.0, "collection": "qr3"})
    patch = make_patch(records, ra0, dec0, fov_deg=0.1, workers=1)
    assert patch.size == 117
    assert len(patch.epochs) == 2
    assert patch.epochs[0]["n_images"] == {2: 3, 6: 3} and patch.epochs[1]["n_images"] == {2: 2, 6: 2}
    assert "1 exposures could not be read" in patch.warnings
    assert patch.data_release["collections"]["dr1"] == 10 and patch.data_release["collections"]["qr3"] == 0
    payload = encode_patch(patch, "x")
    data, share = decode_frame(payload, 0, 0)
    c = (117 - 1) // 2
    peak = np.unravel_index(np.nanargmax(data), data.shape)
    # star 20" north of the centre = 6.5 grid px: display row smaller than the centre row
    assert abs(peak[0] - (c - 20 / 3.075)) <= 1 and abs(peak[1] - c) <= 1
    peak2 = np.unravel_index(np.nanargmax(decode_frame(payload, 1, 0)[0]), data.shape)
    assert peak2[0] < peak[0]                                   # moved north between epochs -> smaller row
    assert abs(payload["frames"][0][0]["noise"] - 0.5) < 0.3    # background removed, noise ~ input scatter
    assert np.nanmedian(data) == pytest.approx(0.0, abs=0.3)
    assert 0 < share.max() <= 255 // 3 + 1                      # the HOT pixel in 1 of 3 exposures
