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

Mock job ids for frontend states: `mock` (done, 3 frames), `mock-running` (1 frame),
`mock-error` (`no_coverage` error).

Errors: HTTP status + `{"error": {"code": "...", "message": "..."}}` with codes
`bad_input` (400), `not_found` (404), `no_coverage` (404), `archive_unavailable` (503),
`internal_error` (500). A failed job is still returned with HTTP 200, its reason in `error`.

## Spectrum and light curve

`/api/spectrum` and `/api/lightcurve` measure the cached cutouts (no archive request; open a
position's frames first). Each SPHEREx exposure sees a point of the sky at a different
wavelength, so every cutout gives one point: flux in a 2-pixel (12.3") aperture minus the median
of a 4-7 pixel annulus, error from the `VARIANCE` layer, wavelength from `WCS-WAVE` at the source
pixel. With `pmra`/`pmdec` the aperture follows a moving source to each exposure's date.
Points with a flagged pixel in the aperture (e.g. a saturated core) carry `flagged: true`.

Approximation: surface brightness (MJy/sr) is converted to flux with the nominal pixel area
(6.15" x 6.15"). The true pixel solid angle varies across the detector; the official solid-angle
pixel map (`nasa-irsa-spherex/dr1/solid_angle_pixel_map/`) would make the fluxes more exact.
Aperture losses are not corrected, so fluxes of point sources are underestimated by a constant
factor per detector; spectra shapes and light curves are unaffected.

## Data and acknowledgements

- **SPHEREx** spectral images from the NASA/IPAC Infrared Science Archive (IRSA):
  SPHEREx Data Release 1 (DR1) Spectral Images, [doi:10.26131/IRSA678](https://doi.org/10.26131/IRSA678),
  and SPHEREx Quick Release 3 (QR3) Spectral Images, [doi:10.26131/IRSA662](https://doi.org/10.26131/IRSA662).
- **Gaia DR3** sources from the ESA Gaia archive (`/api/gaia`).
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
photometry, Gaia endpoint, tests and deploy files) was written with an AI coding assistant
(Claude Code, Anthropic) under the direction of the backend owner, who reviewed it and checked it
against real SPHEREx data (tests in `tests/`). The approach and design decisions are the team's
(`docs/design-v2.md`).
