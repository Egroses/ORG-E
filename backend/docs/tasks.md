# Backend tasks (Emirhan)

Status as of 2026-11-14 ~12:40 UTC. Order = priority; each builds on the previous. Times are local.
Update this file as work progresses (`[x]` when done).

## Done (research phase)

- [x] Challenge and all linked resources researched → `docs/challenge.md`, `docs/spherex-data.md`
- [x] Teammate design doc reviewed; 5 additions agreed → `docs/design-v2.md` (waiting for Yusuf's confirmation of v2)

## Saturday, first hour

- [ ] Create repo, folders (`backend/ pipeline/ imaging/ frontend/`), `LICENSE`, `.gitignore`, README stub
- [x] API contract as Pydantic models (incl. `data_release`, `display_range`, proposed `grid`, `mjd_mean`) → `backend/app/models.py`; **team approval pending**
- [x] Mock server (FastAPI): fixed JSON + 3 PNGs (shared min/max), `mock-running`, `mock-error`, tests pass. PNGs are synthetic; replace with real Barnard frames
- [ ] Hand mock to frontend owner

## Saturday evening

- [x] Coordinate parsing + `GET /api/resolve` (coordinates → 5-target table → SIMBAD Harvard → CDS). CDS main server still 404 on 14 Nov
- [x] Hard-coded table of the 5 test targets with 2026.0 positions + proper motions (SIMBAD values, propagation checked against `pipeline/targets.json`)
- [x] Job model: `POST /api/jobs`, `GET /api/jobs/{id}`, frame serving, `/api/diff`; job id = hash(rounded ra/dec, fov, detector, mode, pm). `data_release` reported, not in the id (see team-notes)
- [x] Wire `pipeline.get_cutouts` behind the job (cached units read from manifest without archive query)
- [ ] Wire `imaging.make_frames` (backend fallback `app/frames.py` used until then)

## Saturday night

- [x] Deploy config ready: `backend/render.yaml` (Render Starter + 1 GB disk), build script, frontend served at `/`, prebuild on start. Proposal: https://claude.ai/artifact/3g7vx4vGPhYNmT1NMSCFgJ
- [ ] First public deploy: Barnard's Star animation playing at a public URL (needs a Render account + card from the team)
- [ ] Persistent disk + cache on the server

## Sunday morning

- [x] `shift_add` mode and `GET /api/diff`. Verified on WISE 0855 D6 (45 cutouts): moving stack 17 sigma exactly at centre, fixed stack 11 sigma (offset, smeared), reversed-motion control 6.7 sigma (offset). Barnard diff: white above black (moves north)
- [x] Error cases with clear messages (`bad_input`, `not_found`, `no_coverage`, `archive_unavailable`, `internal_error`)
- [ ] Pre-generate and store frames for all 5 targets (script ready; local cache has barnard D6 + wise0855 D6 only)
- [x] Offline fallback: `scripts/export_static.py` + stand-alone viewer, checked in headless Chrome
- [x] Static export for embedding in the site (`--frontend`, contract in `docs/static-export.md`) and `LIVE_QUERIES` switch (team decision 14 Nov: embed the five targets, keep live queries for other positions)

## Sunday afternoon (drop if late)

- [x] `GET /api/spectrum` (aperture photometry on cached cutouts, follows proper motion; checked on Barnard D6)
- [x] `GET /api/lightcurve` (same measurement, one detector, optional wavelength band; R Draconis needs its cache)
- [x] `GET /api/gaia` (Gaia DR3 ESA TAP, propagated to 2026.0)
- [x] Mock job uses real Barnard D6 frames

## Plan A: `/api/patch` (team decision 15 Nov; list in `../docs/backend-patch-tasks.md`)

- [x] `GET /api/patch` per `docs/patch-api.md`: 202/200, errors with `status: "failed"`, 10 arcsec snap, gzipped disk cache, one detector for live queries, prebuild of the frontend's patches
- [x] `/api/jobs` uses `imaging.make_frames` when installed, falls back to `app/frames.py`; `engine.txt` per job
- [x] `/api/health`: `cached_units`, `frame_engine`, `patch`
- [x] Tested with the `feature/imaging-quest` branch on the full cache (69 tests, 5 targets x 2 detector sets)
- [x] `imaging/` merged into `main` (79ebb33); on `main`: 69 backend + 27 imaging tests pass, smoke test `/api/patch` Barnard 200
- [x] Frontend `realProvider.ts` against `/api/patch` (3adb847); checked end to end, five cases open with real data
- [x] Refresh with new data: `scripts/refresh.py` (incremental download, `--check`); jobs and patches keep a manifest stamp and are rebuilt when the cache changes (71 tests)

## Sunday 18:00 code freeze

- [x] README (EN), AI-usage note, IRSA acknowledgement + DOIs, pixel-area approximation note (backend/README.md; SPHEREx/IRSA/SIMBAD texts from their sites, DOIs resolved 14 Nov)
- [ ] Open public URL in a private window, confirm no password
- [ ] Give URL + repo link + 5–6 sentence English description to the submission owner

## Open decisions

- Hosting provider (needs persistent disk, free tier memory limit)
- Polling (2 s) vs SSE for progress
- Gaia: backend endpoint vs Aladin Lite layer
- Allow arbitrary live coordinates during demo?
- How often `data_release` is refreshed (per job vs daily)
