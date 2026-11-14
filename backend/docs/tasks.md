# Backend tasks (Emirhan)

Status as of 2026-11-14 ~12:40 UTC. Order = priority; each builds on the previous. Times are local.
Update this file as work progresses (`[x]` when done).

## Done (research phase)

- [x] Challenge and all linked resources researched → `docs/challenge.md`, `docs/spherex-data.md`
- [x] Teammate design doc reviewed; 5 additions agreed → `docs/design-v2.md` (waiting for Yusuf's confirmation of v2)

## Saturday, first hour

- [ ] Create repo, folders (`backend/ pipeline/ imaging/ frontend/`), `LICENSE`, `.gitignore`, README stub
- [ ] API contract as Pydantic models (incl. `data_release`, `display_range`); get team approval
- [ ] Mock server (FastAPI): fixed JSON + 3 Barnard PNGs (shared min/max), `mock-running`, `mock-error`; hand to frontend owner

## Saturday evening

- [ ] Coordinate parsing + `GET /api/resolve` (SkyCoord first, then SIMBAD main → Harvard mirror TAP)
- [ ] Hard-coded table of the 5 test targets with 2026.0 positions + proper motions
- [ ] Job model: `POST /api/jobs`, `GET /api/jobs/{id}`, frame serving; job id = hash(rounded ra/dec, fov, detector, mode, pm, data_release)
- [ ] Wire `pipeline.get_cutouts` and `imaging.make_frames` behind the job

## Saturday night

- [ ] First public deploy: Barnard's Star animation playing at a public URL
- [ ] Persistent disk + cache on the server

## Sunday morning

- [ ] `shift_add` mode and `GET /api/diff`
- [ ] Error cases with clear messages (`bad_input`, `not_found`, `no_coverage`, `archive_unavailable`)
- [ ] Pre-generate and store frames for all 5 targets

## Sunday afternoon (drop if late)

- [ ] `GET /api/spectrum`
- [ ] `GET /api/lightcurve` (R Draconis)
- [ ] `GET /api/gaia` (only if frontend doesn't use Aladin's Gaia layer)

## Sunday 18:00 code freeze

- [ ] README (EN), AI-usage note, IRSA acknowledgement + DOIs, pixel-area approximation note
- [ ] Open public URL in a private window, confirm no password
- [ ] Give URL + repo link + 5–6 sentence English description to the submission owner

## Open decisions

- Hosting provider (needs persistent disk, free tier memory limit)
- Polling (2 s) vs SSE for progress
- Gaia: backend endpoint vs Aladin Lite layer
- Allow arbitrary live coordinates during demo?
- How often `data_release` is refreshed (per job vs daily)
