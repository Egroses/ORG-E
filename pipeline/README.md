# SPHEREx data pipeline

Downloads small cutouts of NASA SPHEREx spectral images around the five challenge
targets (Barnard's Star, Epsilon Indi B, WISE 0855-0714, RW Aurigae, R Draconis) from
the IRSA archive and keeps them in a local cache. The service (`get_cutouts`) and the
image-processing module read from that cache.

The shared contract (file names, cache layout, manifest columns, who downloads what)
is in [`SPEC.md`](SPEC.md). Read it before changing anything: two machines must
produce byte-identical files.

This code was written with the help of an AI assistant (Claude, by Anthropic) as part of
the NASA Space Apps Challenge 2026.

## Setup

Python 3.12 (see the "Ortam" section at the end of `SPEC.md`). From the repository root:

```
python -m venv .venv
.venv\Scripts\activate            # Windows; on Linux/macOS: source .venv/bin/activate
pip install -r pipeline/requirements.lock.txt
```

Install exactly the pinned versions: a different `astropy` can change the bytes written.

## Commands

Run from the repository root.

| Command | What it does |
|---|---|
| `python -m pipeline rehearse --who A` | Downloads the first 5 Barnard's Star D6 cutouts into `rehearsal/cache_A/` and writes `rehearsal/rehearsal_A.json` |
| `python -m pipeline compare rehearsal/rehearsal_A.json rehearsal/rehearsal_B.json` | Compares two rehearsals; exit code 1 if they differ |
| `python -m pipeline download --assignment A` | Downloads person A's share; safe to interrupt and rerun |
| `python -m pipeline download --assignment A --target barnard --detector 6` | One target and detector of the share |
| `python -m pipeline verify --assignment A` | Checks the share against the current archive listing |
| `python -m pipeline verify --assignment all` | Checks the whole cache |

`download` refuses targets and detectors that are not in the person's share.
Progress is appended to `cache/download_<A|B>.log`. A unit with files that could not be
downloaded gets `cache/<target>/D<n>/failed.txt`; run the same command again to retry them.

## Library use

```python
from pipeline import get_cutouts

records = get_cutouts(269.446271, 4.768197, 0.1, 6)
# [{"path", "mjd", "detector", "wavelength_um", "collection", "version", "obs_id"}, ...]
```

Cutouts that are not cached yet are downloaded first (3 connections, retries on HTTP
503/429). Positions other than the five targets are stored under `cache/custom/`.

## What is stored

For every cutout, the FITS layers `PRIMARY`, `IMAGE`, `FLAGS`, `VARIANCE`, `ZODI` and
`WCS-WAVE` (the large `EPSF` PSF table is dropped, which shrinks a file from about 4 MB
to about 0.13 MB), plus one `manifest.csv` per `cache/<target>/D<n>/` folder.

The `cache/` folder is not committed to git.

## Data acknowledgement

This publication makes use of data products from the Spectro-Photometer for the History
of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint
project of the Jet Propulsion Laboratory and the California Institute of Technology, and
is funded by the National Aeronautics and Space Administration.
