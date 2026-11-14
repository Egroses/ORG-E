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

## Layout

```
src/
  data/       types (data contract), catalog (targets, epochs, bands, cases), mock + provider switch
  sky/        astro (coordinates, proper motion), analysis (answer keys), render (stretch, diff, stack)
  components/ SkyCanvas, CropView, TopBar
  screens/    Landing, CaseBoard, Playfield (case + explore), Reveal, FieldReport, ExploreGate
  state/      progress in localStorage
```
