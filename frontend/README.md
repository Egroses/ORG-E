# Sky Quest (frontend)

Public-facing SPHEREx blink tool for NASA Space Apps 2026, challenge "Planet X and SPHEREx".
Five practice cases (the challenge's test targets) plus free exploration of any coordinates.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build into dist/
```

Every screen has its own address, so back, refresh and shared links work:
`#/`, `#/cases`, `#/case/wise0855`, `#/case/wise0855/result`, `#/report`, `#/explore`.

Deep link straight into explore mode: `/#/explore?ra=133.79&dec=-7.24&fov=0.1` (degrees). The older
`/?ra=133.79&dec=-7.24&fov=0.1` form still works and is redirected.

## Status

Runs on **realistic demo data** (`src/data/mockProvider.ts`): real 6.15″ pixel scale, real epoch dates,
real proper motions, sub-pixel PSF placement, per-epoch noise, one cosmic-ray glitch and a few flagged pixels.
Motion is never exaggerated. The UI shows a "Demo data" chip while the mock is active.

## Plugging in real SPHEREx data

Everything goes through one interface in `src/data/types.ts`:

```ts
interface SkyDataProvider {
  getPatch(req: { ra; dec; fovDeg; cached? }, onStep?): Promise<SkyPatch>;
}
```

A `SkyPatch` is a square cutout, north up / east left, with `frames[epoch][band]` as `Float32Array`
(row-major, `size*size`), matching `flags`, per-epoch/band `noise`, `pixelScale`, `center`, `epochs`, `bands`.
Bands are D2, D4, D6 (shown as 1.4 / 3.1 / 4.7 µm). Each epoch frame is the stack of all images of that detector
in that epoch.

To switch: implement a provider that calls the backend and returns this shape, then change the single export in
`src/data/provider.ts`. Nothing else in the UI needs to change.

## How answers are checked (practice cases only)

`src/sky/analysis.ts` computes the answer key from data, never by hand:
- expected position on each date = catalogue position + proper motion (`src/sky/astro.ts`);
- brightness change = aperture photometry on the three dates vs. noise;
- motion under one pixel accepts "Moved", "No clear change" and "Unsure".

The same code runs on real cutouts, so the cases adapt when real data arrives. Explore mode never scores anything;
marks are saved locally as unverified observations.

Note: practice targets are centred where they are at the middle epoch. Barnard's Star has moved ~4.4′ since 2000 and
WISE 0855 ~2′ since its 2010 catalogue position, so centring on the old coordinates would push them to the edge.
Catalogue values in `src/data/catalog.ts` are approximate; verify against SIMBAD / Gaia DR3 before quoting them.

## Design system and layout (white scientific redesign)

The interface is a clean white scientific tool with the game on top. Tokens, type scale, hairline borders and panel
proportions all live in `src/index.css`.

- **Themes.** Light is the default (white surfaces, grey page, one teal-blue accent, status colours for catalogue/measure/flags,
  text contrast of at least 4.5:1). A dark theme exists behind the moon/sun button in the top bar; the choice is stored in
  `localStorage` (`skyquest.theme.v1`, `src/state/theme.ts`) and only a stored `dark` ever overrides light. The sky pictures stay
  dark in both themes. The five case colours appear only as small accents (case chips, difficulty dots, progress dots).
- **Top bar** (`components/TopBar.tsx`): logo, **Game | Realistic** switch (see "Two modes"),
  Cases / Explore / Notebook, target menu, name or coordinate search, field-of-view control (Explore), Share menu (copy link,
  open in Aladin Lite), progress dots, theme toggle, Tour, Words.
- **Main tool** (`screens/Playfield.tsx`, used for cases and Explore): left navigator (bands x visits map with exposure counts, band legend,
  visit table with windows and mid-dates, Step through Epochs/Bands, "Shown now"), centre picture (`components/SkyCanvas.tsx` with RA/Dec
  gutters, N/E compass, scale bar, cursor read-out in RA/Dec and noise units, flag overlay, catalogue marks with non-overlapping labels),
  timeline with visits placed by date, Blink / Difference / Stack, speed, a layers bar (flags, pixel grid, magnifier, faint detail,
  invert, brightness, contrast, stretch), and a right Findings panel (measurement, catalogue check, field data, spectrum empty state,
  changes in this field).
- **Game coaching is isolated.** All coaching (goal, steps, chips, hint, "Check the catalog", the shown answer, and the Explore notes)
  is rendered inside one block, `<div className="coach-slot" data-coaching>`, at the top of the Findings panel. The tool root carries
  `data-view="game"`, so a later Realistic view can hide `[data-coaching]` as a unit.
- **Phone (<= 820 px).** Picture first, then timeline, then a Findings / Layers / Map tab bar that shows one panel at a time.
- Display-only controls (brightness, contrast) are CSS filters; the stretch (asinh, square root, linear) is shared by all visits.
- Spectrum is not built; the panel says so instead of drawing a curve.

## Layout (older notes)

```
src/
  data/       types (data contract), catalog (targets, epochs, bands, cases), mock + provider switch
  sky/        astro (coordinates, proper motion), analysis (answer keys), render (stretch, diff, stack)
  components/ SkyCanvas, CropView, TopBar
  screens/    Landing, CaseBoard, Playfield (case + explore), Reveal, FieldReport, ExploreGate
  state/      progress in localStorage
```

## Merged interface: what changed

Sky Quest now combines its game flow with the measurement tools and design approach of a blink-comparison viewer.

- **Real data provider** (`src/data/realProvider.ts`, `decode.ts`): reads `GET /api/patch` (contract in `docs/patch-api.md`),
  polls on HTTP 202 every 2 s (gives up after about 3 minutes with a friendly message) and converts to `SkyPatch`
  (noise reference = median of all frame noises, masked NaN pixels become 0 and flagged, flag_share >= 51 means flagged).
  A band with no exposure in a visit becomes an all-zero, all-flagged frame and shows "No photo" in the observation map.
- **Data source order** (`src/data/provider.ts`): live backend (`{VITE_API_BASE}/api/patch`) -> saved real copy shipped with the app
  (`public/static`, "saved copy" notice) -> a plain-language error. Demo data is never a fallback; the only way to get it is the
  developer switch `?data=mock`, which shows a full-width red banner ("DEMO DATA ... not real SPHEREx images") on every screen.
- **Measure it** (`src/sky/measure.ts`), **catalogue check** (`catalogue.ts`, `src/data/gaiaApi.ts`), **changes in the field** (`changes.ts`).
- **Observation map** (bands x visits matrix), Measure and Changes tabs, discovery notebook with CSV export (Field report),
  glossary ("Words"), tour ("Tour", opens once, remembered), three-zone layout and a bottom sheet at 820 px and below (tap the handle to cycle three heights).

## Run against real data

```
# terminal 1: the real backend on port 8000 (cache setup: docs/backend-patch-tasks.md)
cd backend && uvicorn app.main:app --port 8000
# terminal 2
cd frontend && npm run dev        # /api is proxied to http://localhost:8000
```
For a deployed service set `VITE_API_BASE`. If the service is down, the app opens the saved copies of the five practice targets
(`public/static`, made by `node scripts/export-static.mjs --api http://localhost:8000`); a view with no saved copy shows an error,
never made-up data. `imaging/dev_server.py` is a contract reference server for tests only; do not use it to run the app.

## Tests

`npm test` (vitest): decode, conversion (orientation, flags, noise, null frames), polling, measuring (including the sign of Dec motion),
catalogue propagation and verdicts, changes detector. `npm run build`, `npm run lint`.

## Known limits

- Dark theme only; no light theme yet. Share link works; `&embed=1` and the spectrum chart are not built.
- Measuring and the changes detector are approximate (saturated stars, crowded fields, faint dots); the interface says so.
- Game tolerances are in native 6.15 arcsec pixels; real patches use a 3.075 arcsec grid and the answer key rescales for it.
- The bottom sheet is tap-to-cycle, not draggable.

## What we learned running it on real SPHEREx data

Checked on 14 Nov 2026 with the contract reference server (`imaging/dev_server.py`) and the five cached targets (the numbers below are measurements):

- **Visits (photos).** The practice cases ask the backend for `gap_days=30, max_span_days=60` (R Draconis: `60 / 150`), which gives
  three visits with all three bands for Barnard's Star, WISE 0855 and RW Aurigae. The server defaults (10 / 30) give 7 to 16 visits
  with one or two bands only. See `docs/patch-api.md`.
- **Exact coordinates.** Practice cases send the positions from `pipeline/targets.json` (`CASE_CENTRES` in `src/data/provider.ts`).
  They must stay identical: a field centred one arcsecond away is not found in the cache by the real backend.
- **Saturated stars.** Barnard's Star is flagged in 98% of its aperture at 1.4 and 3.1 µm, and its "brightness change" there is an
  artefact (+34% between visits), while at 4.7 µm it is stable within 1%. R Draconis is saturated in all three bands. The answer key
  (`src/sky/analysis.ts`) therefore ignores bands that are at least 70% flagged and, if every band is saturated, says so and falls back
  on catalogue knowledge (`variable: true` in `catalog.ts`) instead of inventing a number.
- **`noise: null`.** The backend sends `null` when it cannot measure the noise; it counts as the reference noise (dividing null gave 0).
- **Gaia.** The dev server does not serve `/api/gaia`; the catalogue check then uses the five built-in objects and says so.


## Two modes: Game and Realistic

The **Game | Realistic** switch is in the top bar (also on phones), and Realistic has a second entry on the Landing page
("Explore the data in detail"). The choice is kept in the address and in `localStorage` (`skyquest.mode.v1`).

- **Game**: guided practice cases and coaching, as before. Requests exactly `dets=2,4,6`.
- **Realistic** (`screens/RealisticTool.tsx`, root `data-view="realistic"`, no `[data-coaching]`, no chips, badges or hints):
  an unsimplified explorer. Requests `dets=1,...,6` with a visit grouping chosen by the visitor (Fine 10/30 days, Normal 30/60,
  Coarse 60/150). It never falls back to demo data: a failing or unreachable service shows its error text
  (`?data=mock` is the only way to see demo data, which has three bands and no physical units; the views that need real data hide themselves).
  All its sentences are in `src/ui/realisticText.ts`.

URL: `#/explore?ra=&dec=&fov=&view=realistic&band=D5&visit=2&ref=1&mode=blink|diff|stack&stretch=linear|asinh|sqrt|log&lo=5&hi=99.5&group=fine|normal|coarse&layer=none|flags|heavy`
(`visit` and `ref` count from 1; defaults are omitted). Old links without `view` open in the remembered mode (Game for new visitors).
The address bar is updated as you change the view, and Share copies the same link.

What Realistic shows: bands x visits table with exposure counts and holes ("no photo"), band legend with wavelength ranges, visits table;
RA/Dec gutters, compass, scale bar, cursor read-out in MJy/sr +/- noise, colour bar in MJy/sr, stretch (linear, asinh, square root, log) with
percentile cuts and their physical values, blink / difference (choice of reference visit) / stack (choice of visits, per band);
quality layers (flag share, heavily flagged); marked source (position, shift with uncertainty, proper motion, position angle, per-visit table);
aperture photometry per band and visit in mJy with flagged share and lower limits, flux-versus-date chart, band ratios; catalogue sources in view
(Gaia when `/api/gaia` answers, else the built-in five); changes in the field; candidates with CSV export; data panel (source, scale, field, visits,
grouping, exposures per collection, noise in MJy/sr, flagged and no-data shares); spectrum from `/api/spectrum` if the server has it.

What it does not show: no zodiacal-light layer, no 102-channel spectrum, no model fits (ratios are plain flux ratios). Photometry errors assume
independent pixels, which the resampled grid is not, so they are underestimates. Cutouts are 0.1 degree wide: larger fields have no-data edges.
The spectrum chart was tested only with a fake response, never against the real backend. Non-cached positions are only served by the real backend with live queries on.

**No-data pixels** (masked / NaN in the archive) are painted as hatched mid-grey in both modes, with a legend entry in Realistic mode.

## Languages (Turkish and English)

TR | EN switch in the top bar. Choice order: `?lang=tr|en` in the address (so a shared link opens in its language) > saved choice (`skyquest.lang.v1`) > Turkish if
`navigator.language` starts with "tr" > English. `<html lang>`, the title and the description follow. The layer is `src/i18n/`
(`en.ts` is the source of truth, `tr.ts` has the same keys, enforced by TypeScript; texts live in `src/i18n/parts/`).
`t(key, {vars})`, `tp(key, n)` for plurals, `useI18n()` in components; numbers and dates go through `Intl` (`format.ts`).
Visit labels and windows are computed from the MJD numbers (`data/epochs.ts`), never from the server's English strings.
Sentences built in code are structured data formatted at render time (`truthText`, `verdictText`, `changeAmountText`).
Limits: server `warnings` are shown as received (English); candidates saved before this change keep their English verdict sentence;
CSV column names stay English.

## Saved copies (static fallback)

When the live service cannot answer, the five practice targets still open from files in `public/static/`
(`index.json`, `patch/<target>.game.json`, `patch/<target>.realistic.<normal|coarse>.json`, `patch/<target>.gaia.json`).
They are verbatim `/api/patch` and `/api/gaia` answers (hosts gzip them; they are not pre-gzipped), made by:

    npm run export-static -- --api http://localhost:8000 [--only barnard,rdra] [--groups fine,normal,coarse]

(Node 18+, no dependencies; polls 202 every 2 s, 10 min timeout per file; fov 0.1, the exact `pipeline/targets.json` positions,
Game = detectors 2,4,6 with 30/60 days (R Draconis 60/150), Realistic = detectors 1-6 with the grouping presets.)
`src/data/staticProvider.ts` matches a request by position (within 10 arcsec), field, detector set and grouping.
Order: live answer, else saved copy (Game, Realistic and Explore), else (Game only) demo data; Realistic never shows demo data.
`?data=mock` still forces demo data. A patch from a saved copy carries `savedCopy` and the screens show
"Showing a saved copy from <date> (live service unavailable)" next to where the "Demo data" chip would be. Gaia: `/api/gaia`, else `<target>.gaia.json`, else the built-in five.
Size: 23 MB for 20 files. The Realistic "Fine" grouping (10/30 days) was left out to stay under 25 MB (it would add 13 MB), so with the service
down, Fine shows an error; Normal and Coarse work. Only fov 0.1 is saved. Explore in Game view (no grouping in the request) gets the Game copy.
Re-run the export after the data changes.
