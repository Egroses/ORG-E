# Patch API contract (`GET /api/patch`)

Status (15 Nov 2026): **implemented on `main`**. `imaging/` (`make_patch`, `encode_patch`), the backend route
(`backend/app/patch.py`) and the frontend decoder (`frontend/src/data/realProvider.ts`) all follow this file; the contract
fields below are unchanged. Only the notes about live queries and the 202 `progress` object were updated on 15 Nov.
Written so that three pieces fit together without guessing:

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

**Cached targets and coordinates.** A request within 10 arcseconds of one of the five cached targets
(`pipeline/targets.json`, positions at epoch 2026.0) is served from that target's cache; the backend must snap like this,
because a field centred even one arcsecond away would otherwise miss the cache. The real backend snaps within
10 arcseconds (`SNAP_ARCSEC` in `backend/app/patch.py`); the frontend still sends the exact `targets.json` numbers; the
reference dev server (`imaging/dev_server.py`, tests only) snaps within 0.001 degree (3.6 arcsec).

**Live queries (coordinates that are not cached) are slow.** Since commit `48d4e82` (15 Nov) the one-detector limit is gone:
for a position that is not cached the backend downloads **every requested detector** from the SPHEREx archive, one after the
other, and then builds the patch. Each detector takes about 2 to 5 minutes. Measured live run (15 Nov, backend owner):
RA 10, Dec 10, `dets=2,4,6` = 167 files in **15.5 minutes**, 0 failed. Other positions and `dets=1,...,6` were not timed
by us (6 detectors would be roughly twice as long: an extrapolation, not a measurement). Live queries are on by default
(`LIVE_QUERIES=1` in `backend/app/config.py`; `backend/render.yaml` still sets `"0"` for the hosted service, so a
hosted copy answers `archive_unavailable` for uncached positions unless that value is changed. Whether the hosted service is
deployed was not verified). With live queries off, an uncached position answers `200` with `"status": "failed"` and
`"error": {"code": "archive_unavailable", ...}` at once.

While the download runs, the `202` answer carries extra progress fields (details and a real example in
`backend/docs/spectrum-api.md`, section 6): `progress.detector_done`, `progress.detector_total` (detectors finished / to fetch)
and `progress.eta_s` (seconds left at the speed so far, `null` for the first five files). `total` and `done` count files
over all detectors. During the stacking step after the download only `total`, `done`, `failed` are sent. Clients must
ignore fields they do not know. A server restart in the middle keeps the files already downloaded; the next request fetches
only the rest.

The frontend therefore keeps polling every 2 s and gives up after **25 minutes** for a position that is not in the saved
set (3 minutes for a saved target; `frontend/README.md`).

**Epoch settings used by the frontend** (measured on the cached data, detectors 2,4,6):

| Target | `gap_days` / `max_span_days` | Visits | Result |
| --- | --- | --- | --- |
| Barnard's Star, WISE 0855, RW Aurigae | 30 / 60 | 3 | all three bands in every visit |
| Epsilon Indi B | 30 / 60 | 4 | one band missing in the last visit |
| R Draconis | 60 / 150 | 4 | three visits with all bands, the fourth only D4 (the pulsation period is 245 days, so a 5-month visit smooths its variation) |
| any of them with the defaults 10 / 30 | | 7 to 16 | many visits with one or two bands only, or a single exposure |


## Response

The request is idempotent and meant to be polled every ~2 s.

* `202` while the patch is being built: `{"status": "queued" | "running", "id": "...", "progress": {"total": 58, "done": 31, "failed": 0}}`.
  During a live download `progress` also has `detector_done`, `detector_total` and `eta_s` (see "Live queries" above).
* `200` when done: the full object below, `"status": "done"`.
* `200` with `"status": "failed"` and `"error": {"code": "no_coverage" | "archive_unavailable" | "internal_error", "message": "..."}`
  (same codes as the rest of the API). Invalid parameters (RA/Dec out of range, `fov` outside 0.05 – 0.25, `dets` not 1 to 6): HTTP 400 with
  `{"status": "failed", "error": {"code": "bad_input", "message": "..."}}`.

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
5. **Size.** 117 x 117 x 4 bytes = 55 kB per frame. A 3-band, 5-epoch patch is about 0.8 MB raw, 1.1 MB in base64. gzip makes
   it about **2x smaller** (measured on real Barnard frames: the float pixel data compresses about 1.6x, the flag map much more),
   so about 0.55 MB on the wire. The backend should enable gzip for this route.
6. **Version field.** Add `"contract": 1` at the top level when the shape changes; clients must ignore unknown keys.
   (`imaging.encode_patch` already writes `"contract": 1`; the example above leaves it out.)
7. **No NaN or Infinity in the JSON.** JSON cannot carry them and `JSON.parse` would reject the whole answer. `noise` is `null`
   when it cannot be measured (for example a frame without empty-sky pixels); clients treat `null` as "unknown". NaN *pixels*
   are fine: they live inside the base64 bytes.
8. **`n_images`** keys are strings (`"2"`, `"4"`, `"6"`); a detector with no exposure in that epoch is omitted from the object, and
   its frame is `null`.
9. **`flag_share`** counts every flag except FULLSAMPLE and SOURCE (the saturation bits OVERFLOW, SUR_ERROR and BLOOM
   included), over the exposures that cover the pixel. A saturated star core is therefore flagged, but its pixel values are kept.
10. **`dates` and `label`.** `dates` uses an en dash: `15 Aug – 1 Oct 2025`. `label` is `Mon YYYY`; the day is added when
    two epochs fall in the same month.
11. **`data_release`** is an object here (`collections`, `latest_mjd`), whereas `/api/jobs` returns text: deliberate, the routes
    are separate. `latest_mjd` is `null` when nothing was loaded.
12. **Field larger than the cached cutouts.** The cached cutouts are 0.1 degree wide, so `fov` above 0.1 has NaN edges.

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
