# imaging

Turns cached SPHEREx cutouts into co-added frames (for `/api/jobs`) and into numeric patches (for
`GET /api/patch`, contract in `docs/patch-api.md`). Runs on numpy + astropy + pillow; scipy is only
used by one test.

AI-assisted code (Claude Code), as required by the challenge rules.

## Usage

```python
from imaging import make_patch, encode_patch, make_frames

patch = make_patch(records_by_detector, ra, dec, fov_deg=0.1, gap_days=10, max_span_days=30)
payload = encode_patch(patch, job_id="3f9a1c0b7d2e")   # dict exactly as in docs/patch-api.md

# same signature and outputs as backend/app/frames.py (three optional keywords added at the end)
make_frames(records, ra, dec, fov_deg, mode, pmra, pmdec, center_epoch, out_dir)
```

`records_by_detector` is `{detector: [record, ...]}`, a record being what `pipeline.get_cutouts`
returns. `imaging.records.load_records(cache, target, det)` builds records from the cache layout.
`make_patch` reads cutouts in a process pool (up to 8 processes, created on first use and kept);
pass `workers=1` to stay in-process. Scripts that call it need an `if __name__ == "__main__":` guard
on Windows (spawn).

Arrays inside `Patch` are in FITS order (row 0 = south). `encode_patch` flips them (`np.flipud`) so the
payload is north-up, east-left, as the contract says. `imaging.patch.decode_frame` is the inverse.

## Design choices

**"V2 hybrid".** Our prototype compared three pipelines on the cached data
(`E:\nasa\imaging-proto`): the current backend, the MIT-licensed `spherex-blink` core, and a hybrid. The hybrid
uses spherex-blink's pure-numpy WCS (`tanwcs.py`), bilinear resampling and sigma-clipped-mean stacking,
with our preprocessing: `IMAGE - ZODI`, bad-pixel mask with saturated cores kept, sigma-clipped median
background. In that prototype it gave about 10 % more aperture SNR than the backend on WISE 0855 and
recovered Barnard's Star proper motion within 1 %. The numbers from this package are in the validation section below.

**Masking.** Bit numbers come from the `MSKN*` header keywords, with `DEFAULT_BITS` filling names a header
does not define. Bad: TRANSIENT, NONFUNC, MISSING_DATA, HOT, COLD, PHANMISS, PERSIST, OUTLIER, STREAK,
SNOWBALL (become NaN). OVERFLOW, SUR_ERROR and BLOOM protect a pixel from masking (bright star cores).
`flag_share` counts any flag except FULLSAMPLE and SOURCE (informational), including the saturation
bits, as share of covering exposures, scaled to 0-255.

**Bilinear resampling**, not nearest neighbour: the grid is twice as fine as the detector, and a moving
source is placed with sub-pixel accuracy instead of snapping. Pixels outside the cutout, or with any NaN
among the 4 neighbours, become NaN (a masked pixel grows to a 2 x 2 hole; accepted). Flags use nearest neighbour.
Resampling smooths noise, so pixels become correlated: quote SNR from empirical aperture noise
(`validate.aperture_snr`), not from per-pixel sigma times sqrt(N).

**Clipping.** `clip=True` uses a per-pixel 3-sigma (MAD) clipped mean, 2 passes, with 3 or more frames; with
1-2 frames it is a plain mean. Exposures of one epoch are at different wavelengths, so a spectrum can look
like an outlier. We checked this on the two variable stars (RW Aur, R Dra, D6, per-epoch aperture flux, clip vs no clip):
the largest difference was 1.3 %, below the 5 % limit, so **the default stays `clip=True`**. `clip=False` is available.

**Epochs.** Built once from the exposures of all requested detectors, so every band shares them. A new epoch
starts after a gap longer than `gap_days` (10) **or** when the epoch would span more than
`max_span_days` (30). The span cap is needed near the ecliptic poles (R Dra), where coverage is continuous and
a gap rule alone would give one epoch for the whole mission.

**Grid.** `n = round(fov * 3600 / scale)`, forced odd for `make_patch` (centre = pixel centre, 0-based
`(n-1)/2`); `make_frames` keeps the backend's rule (no forcing) so its stacks keep their shape. Scale 3.075".

**Speed.** `fitsread.py` is a small FITS reader (astropy's header parsing alone was ~10 ms per cutout), the
WCS inversion runs on every 4th grid pixel and is interpolated (< 0.01 px, tested), the clipped mean uses a sort-based
NaN median, and cutouts are read in worker processes. `tests/` compare the reader and WCS with astropy.

## Running

```
python -m venv .venv && .venv\Scripts\python -m pip install numpy astropy pillow pytest scipy
.venv\Scripts\python -m pytest imaging/tests -q          # ORG_CACHE=<cache folder> overrides E:\nasa\ORG-E\cache
.venv\Scripts\python -m imaging.validate --cache E:\nasa\ORG-E\cache
.venv\Scripts\python -m imaging.dev_server --cache E:\nasa\ORG-E\cache --port 8000 --prebuild
```

Real-data tests are skipped when the cache is missing. The dev server (standard library only) serves
`GET /api/patch` and `GET /api/health`: 202 while building, 200 when done or failed, CORS `*`, in-memory
results, gzip when requested. It only knows the five cached targets (position within 0.001 deg) and is the reference for the
backend's route.

## Validation (this machine, cache of 3902 files)

See `python -m imaging.validate`. Last run: Barnard D6 northward shift 10.15" over 0.99 yr against
10.27" expected (ratio 0.988); WISE 0855 D6 shift-and-add empirical SNR 8.6 against 8.0 for
`backend/app/frames.py` with the source 0.4 px from the grid centre; `make_patch` for D2/D4/D6 takes 0.3-3 s per target
(R Dra, 1246 exposures, about 2.5 s with a warm pool; first call adds about 1 s for process start).

## Known limits

- Epoch boundaries are heuristic. Many short epochs (1-4 exposures) appear next to long ones; their
  noise is higher, and `n_images` says so.
- Exposures in an epoch sit at different wavelengths. A frame is a band average, and two epochs whose exposures
  cover different parts of the band can differ in brightness without real change.
- The target must lie inside the cutout; fields larger than the cached 0.1 deg cutouts have NaN edges.
- Bilinear NaN growth and correlated pixels (see above). `noise` in the payload is the per-pixel MAD, which
  understates the noise of a multi-pixel aperture.
- Flag-bit meanings are inferred from names (see `docs/wdd-goruntu-isleme.md`); the policy is a first version.
- Proper motion is applied linearly; parallax is ignored (well under a pixel for the test targets).
- The FITS reader supports the layout of the cached cutouts (image HDUs, no BSCALE tricks beyond simple
  scaling); an unexpected file is counted as unreadable.
- `make_frames` reads cutouts serially in the calling process.
- Not verified: live (non-cached) data, SPHEREx data other than the five targets, detectors 1, 3 and 5
  (never run), behaviour under uvicorn with the process pool.
