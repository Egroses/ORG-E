"""Real-data tests on the cached targets (skipped when the cache is missing; set ORG_CACHE).
AI-assisted code (Claude Code)."""
import json
import time

import numpy as np
import pytest

from imaging import core, make_frames, make_patch
from imaging import validate as v
from imaging.records import load_records_by_detector


def test_barnard_proper_motion_and_orientation(cache):
    b = v.barnard_check(cache)
    assert abs(b["ratio"] - 1.0) < 0.02, b          # northward shift within 2% of 10.362 arcsec/yr
    first_row, last_row = b["display_rows"]
    assert last_row < first_row                     # display order: the star moves toward smaller rows


def test_wise0855_shift_and_add_snr_not_worse_than_backend(cache):
    pytest.importorskip("backend.app.frames")
    w = v.wise_check(cache)
    assert "backend" in w
    assert w["ours"][0] >= w["backend"][0], (w["ours"], w["backend"])
    cx, cy = w["centroid"]
    assert abs(cx - w["centre"][0]) < 2.0 and abs(cy - w["centre"][1]) < 2.0   # source at the grid centre


@pytest.mark.parametrize("target", ["rwaur", "rdra"])
def test_variable_star_clip_vs_noclip(cache, target):
    r = v.variable_check(cache, target)
    # Spec: if clipping changes a bright variable star's flux by 5% or more, the default must be False.
    assert r["max_rel_diff"] < 0.05 or core.DEFAULT_CLIP is False, r


@pytest.mark.parametrize("target", list(v.TARGETS))
def test_make_patch_is_fast(cache, target):
    t = v.TARGETS[target]
    records = load_records_by_detector(cache, target, (2, 4, 6))
    t0 = time.time()
    patch = make_patch(records, t["ra"], t["dec"])
    assert time.time() - t0 < 5.0
    assert patch.epochs and patch.size == 117
    assert all(len(row) == 3 for row in patch.frames)                       # one shared epoch list
    assert all(any(row[i] is not None for row in patch.frames) for i in range(3))
    for e, row in zip(patch.epochs, patch.frames):
        assert e["n_images"] == {b["detector"]: f.n_images for b, f in zip(patch.bands, row) if f is not None}
        assert e["mjd_end"] - e["mjd_start"] <= 30.0 + 1e-9


def test_make_frames_output_works_with_backend_helpers(cache, tmp_path):
    backend = pytest.importorskip("backend.app.frames")
    t = v.TARGETS["barnard"]
    records = load_records_by_detector(cache, "barnard", (6,))[6]
    out = tmp_path / "job"
    result = make_frames(records, t["ra"], t["dec"], 0.1, "epoch", t["pmra"], t["pmdec"], 2026.0, out)
    assert set(result) == {"grid", "display_range", "frames", "n_unreadable"}
    assert set(result["grid"]) == {"ra", "dec", "scale_arcsec", "width", "height"}
    assert len(result["frames"]) >= 3 and result["n_unreadable"] == 0
    assert {"n", "t_start", "t_end", "mjd_mean", "detector", "wavelength_um", "n_images", "flagged_fraction"} \
        <= set(result["frames"][0])
    for f in result["frames"]:
        assert (out / f"{f['n']}.png").is_file()
    assert json.loads((out / "frames.json").read_text(encoding="utf-8")) == result
    stacks = np.load(out / "stacks.npz")["stacks"]
    assert stacks.dtype == np.float32 and stacks.shape == (len(result["frames"]), 117, 117)
    backend.write_diff_png(out / "stacks.npz", 0, len(stacks) - 1, tmp_path / "diff.png")   # backend helper
    assert (tmp_path / "diff.png").stat().st_size > 0
    ref = tmp_path / "ref"
    backend.make_frames(records, t["ra"], t["dec"], 0.1, "epoch", t["pmra"], t["pmdec"], 2026.0, ref)
    assert np.load(ref / "stacks.npz")["stacks"].shape[1:] == stacks.shape[1:]


def test_make_frames_shift_add_has_two_frames(cache, tmp_path):
    t = v.TARGETS["wise0855"]
    records = load_records_by_detector(cache, "wise0855", (6,))[6]
    result = make_frames(records, t["ra"], t["dec"], 0.1, "shift_add", t["pmra"], t["pmdec"], 2026.0, tmp_path / "w")
    assert [f["n"] for f in result["frames"]] == [0, 1]
    with pytest.raises(ValueError):
        make_frames(records, t["ra"], t["dec"], 0.1, "shift_add", None, None, 2026.0, tmp_path / "w2")
