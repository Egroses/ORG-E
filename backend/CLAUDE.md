# CLAUDE.md

This repo is a team entry for **NASA Space Apps Challenge 2026: "Planet X and SPHEREx"**.
The user (Emirhan, GitHub `Egroses`) owns the **backend / "Servis ve Analiz"** role.

## Working rules

- **Always talk to the user in Turkish.** Code, identifiers, commit messages, API field names and README are in **English**.
- Write clean, simple code. This is a ~36-hour hackathon: prefer the simplest thing that works, no extra infrastructure (no Celery, no Kubernetes, no separate queue).
- Deadline: **Sunday 15 Nov 2026 23:59** (local). Code freeze **Sunday 18:00**; after that only bug fixes.
- Do not change the API contract silently. Any change must be agreed with the frontend owner first (see `docs/design-v2.md`).
- Never commit cache, downloaded FITS files or secrets (`.gitignore`).
- Any AI-assisted code must be noted in the README (challenge rule).

## Read these first

| File | What is in it |
| --- | --- |
| `docs/challenge.md` | Verbatim challenge text, test targets, resource links |
| `docs/design-v2.md` | **The team's agreed design for the backend role** (API contract, mock version, job model, schedule, acceptance criteria). This is the source of truth. |
| `docs/spherex-data.md` | SPHEREx data research: products, FITS layout, TAP/SIA/cutout/S3 access, exact queries, performance numbers, gotchas |
| `docs/tasks.md` | Backend to-do list in priority order with status |

## Architecture in one paragraph

Four modules, data flows left to right: IRSA archive → `pipeline/` (cutouts + cache, owned by a teammate) → `imaging/` (frame co-adds, diff, PNG, owned by a teammate) → `backend/` (this role: FastAPI service, name resolve, job model, analysis endpoints) → `frontend/` (React, owned by a teammate). The backend calls pipeline and imaging as **Python functions** (no network between them): `get_cutouts(ra, dec, size_deg, detector)` and `make_frames(cutouts, mode)` (names are proposals, confirm with owners). Backend alone talks to SIMBAD and Gaia.

## Suggested stack

- Python 3.11+, FastAPI, Uvicorn, Pydantic v2
- astropy (SkyCoord parsing, `apply_space_motion`), astroquery (`ipac.irsa`, `simbad`, `gaia`), photutils (aperture photometry), numpy
- Background jobs: FastAPI BackgroundTasks or a `ThreadPoolExecutor`; job state in an in-memory dict, frames/cache on persistent disk
- Folders: `backend/`, `pipeline/`, `imaging/`, `frontend/`

## First steps (Saturday, first hour)

1. Repo skeleton: folders, `LICENSE` (Apache-2.0 unless team decides otherwise), `.gitignore`, `README.md` stub.
2. Write the API contract as Pydantic models in `backend/` (fields in `docs/design-v2.md`, including the v2 fields `data_release` and `display_range`).
3. Mock server: fixed JSON + 3 PNGs (from the real Barnard's Star cutouts left over from Yusuf's data feasibility test; the files are on Yusuf's computer, ask him for them. If they are not available, fetch 3 cutouts, one per epoch, via the TAP query in `docs/spherex-data.md`), returned regardless of parameters. Includes `/api/jobs/mock-running` and `/api/jobs/mock-error`. Hand to frontend owner.

## Key facts not to forget

- SPHEREx pixel = 6.15″. Test-target motion is **sub-pixel per 6 months** (Barnard ~0.85 px). Diff images + zoom matter.
- Catalog positions are old: Barnard's Star moved ~4.4′ since J2000, which is **outside a 0.1° cutout**. Always propagate to epoch 2026.0 with proper motion.
- Each SPHEREx exposure sees a given sky point at a **different wavelength** (LVF). One animation frame = co-add of one detector's exposures in one observing epoch.
- All frames in a job must share one `display_range` (common min/max/stretch), otherwise variable-star brightness changes vanish.
- IRSA is slow (≈8 s/cutout, frequent 503). Use parallel requests with retries; pre-generate the 5 test targets.
- Main SIMBAD server did not respond on 14 Nov; the Harvard mirror worked via TAP. Keep a hard-coded table for the 5 targets.
