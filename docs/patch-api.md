# Patch API contract (`GET /api/patch`)

Status: **draft for review**. `imaging/` and the new frontend are being written on a separate branch and are **not on
`main` yet**; this file is the shared contract they are written against. Written so that three pieces fit together
without guessing:

| Piece | Owner | What it does |
| --- | --- | --- |
| `imaging/` | imaging | builds the numbers (`make_patch`) and encodes them (`encode_patch`) exactly as below |
| `backend/` | backend | exposes `GET /api/patch`, runs jobs, caches, serves the encoded result |
| `frontend/` | frontend | `realProvider.ts` decodes the result into the existing `SkyPatch` type |

Why a new endpoint: the game computes its answer key from **real pixel values** (aperture photometry, noise,
flags). The PNG frames of `/api/jobs` are 8-bit and stretched, so they cannot be used for that. `/api/jobs`,
`/api/frames` and `/api/diff` stay as they are.

## Request

`GET /api/patch?ra=&dec=&fov=&dets=`

| Parameter | Type | Default | Meaning |
| --- | --- | --- | --- |
| `ra`, `dec` | float, degrees (ICRS) | required | field centre. Use the 2026.0 position of fast movers (see `pipeline/targets.json`) |
| `fov` | float, degrees | `0.1` | side of the square field; allowed 0.05 – 0.25 |
| `dets` | comma list of 1–6 | `2,4,6` | detectors to return. The game uses `2,4,6` (short / middle / long); explore mode may ask for `1,2,3,4,5,6` |
| `gap_days` | float | `10` | an epoch ends after a gap longer than this |
| `max_span_days` | float | `30` | an epoch is cut after this many days even without a gap (needed near the ecliptic poles, where coverage is continuous) |

The same parameters always give the same job (the backend derives the job id from them).

## Response

The request is idempotent and meant to be polled every ~2 s.

* `202` while the patch is being built: `{"status": "queued" | "running", "id": "...", "progress": {"total": 58, "done": 31, "failed": 0}}`
* `200` when done: the full object below, `"status": "done"`.
* `200` with `"status": "failed"` and `"error": {"code": "no_coverage" | "archive_unavailable" | "internal_error", "message": "..."}`
  (same codes as the rest of the API).

Cached targets (the five test targets) answer `200` immediately.

```jsonc
{
  "status": "done",
  "id": "3f9a1c0b7d2e",
  "source": "irsa",                         // "irsa" = real data
  "center": {"ra": 269.446271, "dec": 4.768197},
  "fov_deg": 0.1,
  "size": 117,                              // pixels per side
  "pixel_scale_arcsec": 3.075,              // grid pixel (native detector pixel is 6.15")
  "unit": "MJy/sr",
  "orientation": "row 0 = north, column 0 = east",   // NORTH UP, EAST LEFT, as drawn on screen
  "epochs": [
    {
      "index": 0,
      "mjd_start": 60902.865, "mjd_end": 60950.2, "mjd_mean": 60921.4,
      "label": "Aug 2025",                  // short label
      "dates": "15 Aug – 1 Oct 2025",       // plain-language window
      "n_images": {"2": 18, "4": 20, "6": 20}   // exposures stacked, per detector
    }
  ],
  "bands": [
    {"detector": 2, "wavelength_um": [1.10, 1.62]},
    {"detector": 4, "wavelength_um": [2.42, 3.82]},
    {"detector": 6, "wavelength_um": [4.42, 5.00]}
  ],
  "frames": [
    // frames[epoch][band]; same indices as `epochs` and `bands`; null if that detector has no exposure in that epoch
    [
      {
        "data": "<base64 of size*size little-endian float32, row-major, MJy/sr>",
        "noise": 0.0123,                    // 1-sigma sky noise of this stack, MJy/sr (robust MAD of empty pixels)
        "flag_share": "<base64 of size*size uint8>",   // 0-255 = share of the stacked exposures in which the pixel carries a bad-pixel flag
        "n_images": 18
      },
      null,
      {"data": "...", "noise": 0.011, "flag_share": "...", "n_images": 20}
    ]
  ],
  "data_release": {
    "collections": {"dr1": 12, "qr3": 4, "dr1_deep": 0, "qr3_deep": 0},   // exposures used, per archive collection
    "latest_mjd": 61300.1
  },
  "warnings": []                            // plain-language strings, e.g. "3 exposures could not be read"
}
```

### Conventions that must not drift

1. **Orientation.** Arrays are in *display order*: row 0 is the northern edge, column 0 is the eastern edge. FITS arrays
   have row 0 in the south, so the encoder flips them (`np.flipud`). A source with positive Dec proper motion therefore
   moves toward smaller row numbers over the years.
2. **Background.** Every frame has its own background removed (zodiacal model, then the sigma-clipped median), so the empty
   sky is about 0 MJy/sr. `noise` is therefore also the typical size of the empty-sky scatter.
3. **Masked pixels** are `NaN` in `data` (JSON carries them inside the base64, which is fine for float32).
   Saturated star cores are **not** masked (see `docs/wdd-goruntu-isleme.md`, section 3 rule 6).
4. **Epochs are shared by all returned detectors**: the epoch list is built once from the exposures of all requested detectors.
5. **Size.** 117 x 117 x 4 bytes = 55 kB per frame. A 3-band, 5-epoch patch is about 0.8 MB raw, 1.1 MB in base64. The backend
   should enable gzip for this route.
6. **Version field.** Add `"contract": 1` at the top level when the shape changes; clients must ignore unknown keys.

## Python side (`imaging`)

```python
from imaging import make_patch, encode_patch

patch = make_patch(records_by_detector, ra, dec, fov_deg=0.1, gap_days=10, max_span_days=30)
payload = encode_patch(patch, job_id="3f9a1c0b7d2e")      # -> dict exactly as above (status "done")
```

`records_by_detector` is `{detector: [record, ...]}` where a record is what `pipeline.get_cutouts` returns:
`{"path", "mjd", "detector", "wavelength_um", "collection", "version", "obs_id"}`.

`imaging.make_frames(...)` keeps the signature and outputs of `backend/app/frames.py` (`n.png`, `stacks.npz`, `frames.json`)
so the existing `/api/jobs` route can switch over with one import.
