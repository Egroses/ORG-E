# Combined server: SPHEREx Blink + guided missions + team backend

`host/serve.py` runs two unmodified applications behind one local address:

- **`blink/`**: the SPHEREx Blink viewer ([YosefGul/spherex-blink](https://github.com/YosefGul/spherex-blink),
  MIT licence, see `blink/LICENSE`) with its own data API and pre-computed seed data for the five
  test targets.
- **`backend/`**: the team backend (targets, resolve, jobs, frames, spectrum, light curve, Gaia),
  reading the pipeline cache in `cache/`.

## Run (Windows, Python 3.12)

From the repository root:

```
py -3.12 -m venv .venv
.venv\Scripts\pip install --no-deps -r pipeline\requirements.lock.txt
.venv\Scripts\pip install -r backend\requirements.txt scipy==1.18.1
.venv\Scripts\python -m uvicorn serve:app --app-dir host --port 8000
```

Then open http://127.0.0.1:8000. Pages: `/` home, `/explore` viewer, `/missions` mission board and
field report. Team API docs: `/docs`.

`LIVE_QUERIES` defaults to `0` here: the team backend answers only from the local `cache/`.

## Request routing

| Path | Answered by |
|---|---|
| `/api/epochs`, `/api/stack`, `/api/quality`, `/api/catalog` | Blink |
| `/api/spectrum` with `pra`/`pdec` | Blink |
| `/api/spectrum` without them, every other `/api/*`, `/docs` | team backend |
| `/missions` | `blink/frontend/missions.html` |
| everything else | Blink frontend |

## What was added to Blink

Blink's viewer logic (`app.js`, `discover.js`, `sky.js`) and its backend are unchanged. Added:

- `blink/frontend/missions-data.js`, `missions.js`, `missions.css`, `missions.html`
- `site.js`: a "Missions" item in the top navigation
- `explore.html`: the mission scripts and style sheet
- `index.html`: a "Guided missions" button

## Guided missions

The case system of the team frontend (`frontend/`, Sky Quest), adapted to Blink: five missions on
the test targets, one Blink tool each (blink, band choice, difference image, brightness change,
light curve). Steps are ticked off as the user does them in the viewer, through Blink's public
`App` hub (`App.S`, `App.on("render")`, `motion()`, `catalogueCheck()`, `changes()`).

The report is checked against data, never against hand-typed answers:

- **motion**: catalogue proper motion from the team backend (`/api/targets`, SIMBAD values)
  multiplied by the time between the first and the last visit; under one pixel (6.15″) a
  "no clear change" answer also counts;
- **brightness**: Blink's "Changes in this field" measurement near the target; for R Draconis the
  team light curve (`/api/lightcurve`) is used only if it has unsaturated points;
- **marker**: within 15″ of the catalogue position moved to the date of the visit.

Team-backend data shown in the missions: target catalogue (`/api/targets`), R Draconis light curve
(`/api/lightcurve`) and the Epsilon Indi B pipeline spectrum (`/api/spectrum`).

## Known limits

- The team charts need the target in the local `cache/`; otherwise they say so.
- R Draconis is saturated in every cached D4–D6 cutout; its light curve is shown with a warning
  and is not used to check the answer.
- Blink positions other than the five test targets, and fields other than 4′, need the IRSA and
  AWS archives.

Progress is kept in the browser (`localStorage`); nothing is sent anywhere.
