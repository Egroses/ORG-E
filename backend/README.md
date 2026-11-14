# Backend (Service & Analysis)

FastAPI service between the data pipeline / imaging modules and the React frontend.
The API contract is in `app/models.py` (source: `docs/design-v2.md`).

**Current state:** `targets` and `resolve` are real. Jobs, frames, diff, spectrum,
lightcurve and gaia are still **mock**: they return fixed responses in the real format,
regardless of parameters, so the frontend can be built before the real code is wired in.

`resolve` accepts degrees (`269.452 4.693`), sexagesimal (`17h57m48.5s +04d41m36s`,
`17:57:48.5 +04:41:36`, `17 57 48.5 +04 41 36`) or a name. The five test targets are answered
from a built-in table; other names go to SIMBAD (Harvard mirror, then CDS). Positions with a
known proper motion are moved from J2000 to epoch 2026.0.
The mock PNGs in `mock_data/` are **synthetic** (a simulated star field with Barnard's Star
moving north); they will be replaced by real SPHEREx frames.

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

Regenerate mock PNGs: `python -m scripts.make_mock_pngs`

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
`bad_input` (400), `not_found` (404), `no_coverage` (404), `archive_unavailable` (503).

## AI assistance

Parts of this backend were written with the help of an AI coding assistant (Claude Code)
and reviewed by the team.
