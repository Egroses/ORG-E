# Static export: the test targets embedded in the site

The five test targets can be shipped inside the frontend as plain files, so they open
instantly with no server and no archive. Every file has the same JSON shape as the API answer
it replaces (`backend/app/models.py`), so the frontend reuses the same code and only changes
where it fetches from.

## Make it

From `backend/` (needs the pipeline cache in `cache/`):

```bash
python -m scripts.prebuild               # build frames for every cached target/detector
python -m scripts.export_static --frontend   # writes frontend/public/static/
```

Vite copies `public/` into the build, so the files end up at `<site>/static/...`.
Size: about 0.1 MB per target and detector; all five targets stay well under 20 MB.
`--out <folder>` writes anywhere else; the folder also contains a stand-alone viewer
(`index.html`) that works on any static host.

## Use it

Read `static/index.json` once. All paths in it, and all frame urls inside the job files, are
relative to the `static/` folder.

| API call | Static file |
| --- | --- |
| `GET /api/targets` | `targets.json` |
| `GET /api/resolve?q=<name>` | `aliases[normalized q]` gives the target key, then `resolve[key]` |
| `POST /api/jobs` + `GET /api/jobs/{id}` | `jobs[]` entry with the same `target`, `detector`, `mode` (or its `key`, e.g. `barnard_D6_epoch`), then its `job` file (already `done`) |
| `GET /api/frames/{id}/{n}.png` | the frame's `url` in the job file |
| `GET /api/diff?job=&a=0&b=<b>` | `diffs["<b>"]` of the job entry (frame b minus frame 0) |
| `GET /api/spectrum` | `spectrum[key]` |
| `GET /api/lightcurve?detector=<n>` | `lightcurve["<key>_D<n>"]` |
| `GET /api/gaia` | `gaia[key]` |

Name normalization for `aliases`: lower case, apostrophes removed, spaces collapsed
(`"Barnard's Star"` -> `"barnards star"`).

Only first-vs-later differences are exported (`a = 0`). A difference between two other frames,
or a position that is not a test target, needs the live API.

## Live and static together

Suggested: try the static files first for the test targets (instant, never down), and call
the live API for anything else. The server's `GET /api/health` answers `live_queries`; when it
is `false`, positions that are not cached answer `archive_unavailable` at once and the
frontend can say "The five sample targets still work."

## `index.json` example

```json
{
 "generated": "2026-11-14T15:20:00+00:00",
 "targets": "targets.json",
 "aliases": {"barnards star": "barnard", "gj 699": "barnard", "wise 0855": "wise0855"},
 "resolve": {"barnard": "resolve/barnard.json"},
 "jobs": [
  {"key": "barnard_D6_epoch", "target": "barnard", "detector": 6, "mode": "epoch",
   "job": "jobs/fb58895f1594.json", "diff": "frames/fb58895f1594/diff_0_4.png",
   "diffs": {"1": "frames/fb58895f1594/diff_0_1.png", "4": "frames/fb58895f1594/diff_0_4.png"}}
 ],
 "spectrum": {"barnard": "spectrum/barnard.json"},
 "lightcurve": {"barnard_D6": "lightcurve/barnard_D6.json"},
 "gaia": {"barnard": "gaia/barnard.json"}
}
```
