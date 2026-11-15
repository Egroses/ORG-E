# Backend (Service & Analysis)

FastAPI service between the data pipeline / imaging modules and the React frontend.
The API contract is in `app/models.py` (source: `docs/design-v2.md`).

**Current state:** every endpoint is real. The ids `mock`, `mock-running` and `mock-error`
still return fixed jobs so the frontend can test its loading and error screens.

Jobs get cutouts from the pipeline (`pipeline/`, cache in `cache/` at the repo root). A unit
already in the cache is read from its `manifest.csv` without querying the archive. Frames are
built by `app/frames.py` (a simplified version of the imaging design, used until the imaging
module is wired in) and stored in `data/jobs/<id>/` (`BACKEND_DATA_DIR` to change).
Finished jobs are reloaded from disk at startup.

Pre-generate frames for the test targets from the local cache:
`python -m scripts.prebuild` (options: `--target barnard --detector 6`, `--refresh`).

`resolve` accepts degrees (`269.452 4.693`), sexagesimal (`17h57m48.5s +04d41m36s`,
`17:57:48.5 +04:41:36`, `17 57 48.5 +04 41 36`) or a name. The five test targets are answered
from a built-in table; other names go to SIMBAD (Harvard mirror, then CDS). Positions with a
known proper motion are moved from J2000 to epoch 2026.0.
The mock PNGs in `mock_data/` are real Barnard's Star D6 frames (three epochs, Aug 2025 -
Aug 2026) copied from a real job by `scripts/make_mock_pngs.py`.

## Run

Python 3.12 (same as the pipeline). The backend calls the pipeline in-process, so the
pipeline's locked package versions are installed first.

```bash
cd backend
py -3.12 -m venv .venv        # Linux/macOS: python3.12 -m venv .venv
.venv/Scripts/activate        # Linux/macOS: source .venv/bin/activate
pip install -r ../pipeline/requirements.lock.txt
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Interactive API docs: http://localhost:8000/docs

Tests: `python -m pytest -q` (add `NETWORK_TESTS=1` to also query SIMBAD live)

Refresh mock PNGs from the real Barnard job: `python -m scripts.make_mock_pngs`

## Deploy (Render)

`backend/render.yaml` is a Render Blueprint: one web service (Starter, 0.5 CPU / 512 MB) in
Virginia with a 1 GB persistent disk mounted on `cache/`. In Render: **New > Blueprint**, pick
this repository and set the Blueprint path to `backend/render.yaml`.

- Build: `backend/scripts/render_build.sh` installs the pipeline lock file and backend
  requirements, and builds `frontend/` if it exists. The backend then serves `frontend/dist`
  at `/` (API under `/api`), so the whole tool has one URL.
- On start, `PREBUILD_ON_START=1` queues frame jobs for every test target already in the cache.
- Fill the disk with the pipeline cache: copy `cache/` from the pipeline machines (`scp` over
  Render SSH), or run `cd backend && python -m scripts.prebuild --download` in the Render shell
  to download the test targets on the server (slow, 2-5 min per target and detector).
- Health check: `GET /api/health`.

## Static export and live queries

The test targets can be embedded in the site as static files (instant, no server, no archive):

```bash
python -m scripts.prebuild                  # frames for every cached target
python -m scripts.export_static --frontend  # writes frontend/public/static/ (or --out <folder>)
```

Every exported file has the shape of the API answer it replaces; `docs/static-export.md`
explains how the frontend maps API calls to files. The folder also holds a small stand-alone
viewer (`index.html`), so it works on any static host as an offline fallback.

`LIVE_QUERIES=0` turns archive downloads off: cached positions (the test targets) still open,
any other position answers `archive_unavailable` at once. Default `1` (positions not in the
cache are downloaded, 2-5 min). `GET /api/health` reports the setting as `live_queries`.
The public demo runs with `LIVE_QUERIES=0` (`render.yaml`, team decision 14 Nov).

## Refreshing with new SPHEREx data

SPHEREx publishes new images every week (Quick Release). To bring the five test targets up to date:

```bash
python -m scripts.refresh --check     # what the archive has that the cache lacks (one query per target)
python -m scripts.refresh             # download only the new images, then rebuild frames and patches
python -m scripts.refresh --target barnard --detector 6 --no-build
```

Downloads go through the pipeline (`sync_unit`, 3 connections) into the existing cache folders;
files already there are never fetched again. Every finished frame job (`data.txt`) and patch
(`<id>.data`) stores a stamp of the `manifest.csv` files it was built from. When the stamp no
longer matches the cache, the result is rebuilt, by `scripts.refresh` or by the running server on
the next request, under the same id. The answer's `data_release` shows the newest data used.
A new archive collection (e.g. a DR2) also needs its name in `pipeline/config.py`.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/targets` | The five challenge test targets |
| `GET /api/resolve?q=` | Name or coordinate text → catalog and 2026.0 position, proper motion |
| `POST /api/jobs` | Start a frame job: `{ra, dec, fov, detector, mode, pmra, pmdec}` |
| `GET /api/jobs/{id}` | Job status and frames ready so far |
| `GET /api/frames/{id}/{n}.png` | One frame |
| `GET /api/diff?job=&a=&b=` | Difference image (later minus earlier) |
| `GET /api/spectrum?ra=&dec=` | Spectrum points |
| `GET /api/lightcurve?ra=&dec=&detector=` | Brightness over time |
| `GET /api/gaia?ra=&dec=&radius=` | Gaia DR3 sources in the field |
| `GET /api/patch?ra=&dec=&fov=&dets=&gap_days=&max_span_days=` | Float32 epoch stacks per detector for the game (contract: `../docs/patch-api.md`); 202 while building, 200 when done |

Mock job ids for frontend states: `mock` (done, 3 frames), `mock-running` (1 frame),
`mock-error` (`no_coverage` error).

Errors: HTTP status + `{"error": {"code": "...", "message": "..."}}` with codes
`bad_input` (400), `not_found` (404), `no_coverage` (404), `archive_unavailable` (503),
`internal_error` (500). A failed job is still returned with HTTP 200, its reason in `error`.

### `/api/patch` and the imaging package

The numbers come from the team's `imaging/` package (`make_patch`, `encode_patch`). The backend
validates the request, snaps positions within 10 arcsec of a test target to its cache, builds the
patch in the background and keeps it as gzipped JSON in `data/patch/` (sent as it is to clients
that accept gzip). A failed patch is reported for 60 s before a new request tries again. Live
queries take one detector only (`400 bad_input` otherwise). With `PREBUILD_ON_START=1` the patches
the frontend asks for on the five targets (`dets=2,4,6` and `1..6`) are built at start.

`/api/jobs` frames also come from `imaging.make_frames` when the package is installed; if it is
missing or fails, `app/frames.py` is used. Each job records which one built it (`engine.txt`),
so frames are rebuilt when the engine changes. `GET /api/health` reports `frame_engine`, `patch`
(imaging installed) and `cached_units` (30 = all five targets, six detectors).

## Spectrum and light curve

`/api/spectrum` and `/api/lightcurve` measure the cached cutouts (no archive request; open a
position's frames first). Each SPHEREx exposure sees a point of the sky at a different
wavelength, so every cutout gives one point: flux in a 2-pixel (12.3") aperture minus the median
of a 4-7 pixel annulus, error from the `VARIANCE` layer, wavelength from `WCS-WAVE` at the source
pixel. With `pmra`/`pmdec` the aperture follows a moving source to each exposure's date.
Points with a flagged pixel in the aperture (e.g. a saturated core) carry `flagged: true`.
Each cutout's pixels and WCS are kept in memory after the first use (~125 kB each), so a second
spectrum near the same position takes well under a second. With `PREBUILD_ON_START=1` the five
targets are loaded at start (about 3 minutes, ~300 MB).

Approximation: surface brightness (MJy/sr) is converted to flux with the nominal pixel area
(6.15" x 6.15"). The true pixel solid angle varies across the detector; the official solid-angle
pixel map (`nasa-irsa-spherex/dr1/solid_angle_pixel_map/`) would make the fluxes more exact.
Aperture losses are not corrected, so fluxes of point sources are underestimated by a constant
factor per detector; spectra shapes and light curves are unaffected.

## Gaia fields

`/api/gaia` answers the five test targets from `app/gaia_fields/<target>.csv` (every Gaia DR3
source with G < 19 within 0.2 deg, epoch 2016.0, ~570 kB in all), so their catalogue works with
no archive. Other positions, larger radii or fainter limits are queried live: ESA first, then the
GAVO mirror. Refresh the files with `python -m scripts.gaia_fields`.

## Data and acknowledgements

- **SPHEREx** spectral images from the NASA/IPAC Infrared Science Archive (IRSA):
  SPHEREx Data Release 1 (DR1) Spectral Images, [doi:10.26131/IRSA678](https://doi.org/10.26131/IRSA678),
  and SPHEREx Quick Release 3 (QR3) Spectral Images, [doi:10.26131/IRSA662](https://doi.org/10.26131/IRSA662).
- **Gaia DR3** sources (`/api/gaia`) from the ESA Gaia archive, or from the GAVO Data Center
  mirror (Heidelberg, `gaia.dr3lite`) when ESA does not answer. The stored fields of the five
  targets (`app/gaia_fields/`) were taken from GAVO on 15 Nov 2026, when the ESA archive was down.
- **SIMBAD** for name resolving (`/api/resolve`), via the Harvard mirror and CDS.

"This publication makes use of data products from the Spectro-Photometer for the History of the
Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet
Propulsion Laboratory and the California Institute of Technology, and is funded by the National
Aeronautics and Space Administration."

"This research has made use of the NASA/IPAC Infrared Science Archive, which is funded by the
National Aeronautics and Space Administration and operated by the California Institute of
Technology."

"This work has made use of data from the European Space Agency (ESA) mission Gaia
(https://www.cosmos.esa.int/gaia), processed by the Gaia Data Processing and Analysis Consortium
(DPAC, https://www.cosmos.esa.int/web/gaia/dpac/consortium). Funding for the DPAC has been
provided by national institutions, in particular the institutions participating in the Gaia
Multilateral Agreement."

"This research has made use of the SIMBAD database, operated at CDS, Strasbourg, France"
(Wenger et al. 2000, A&AS 143, 9).

Libraries: FastAPI, Pydantic, Uvicorn, Astropy, Astroquery, NumPy, Pillow, Requests.

## AI assistance

Space Apps asks teams to state where AI ("Super Intelligence") tools were used. Most of the
backend code in this folder (API models, name resolving, job model, fallback frame maker,
photometry, Gaia endpoint and stored fields, `/api/patch` service, data refresh command, tests and deploy files) was written with an AI coding assistant
(Claude Code, Anthropic) under the direction of the backend owner, who reviewed it and checked it
against real SPHEREx data (tests in `tests/`). The approach and design decisions are the team's
(`docs/design-v2.md`).
