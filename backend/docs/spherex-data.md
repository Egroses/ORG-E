# SPHEREx data: what the backend needs to know

Researched 2026-11-14 from IRSA / Caltech / AWS pages and the official IRSA tutorial notebooks. Items marked *unverified* were not confirmed.

## Mission

- NASA MIDEX, launched March 2025, 2-year plan (Surveys 1–2 year 1, Surveys 3–4 year 2). Full sky every ~6 months, plus deeper polar "Deep Fields".
- 0.75–5.0 µm, 102 spectral channels via a Linear Variable Filter (LVF): **wavelength varies across the detector**, so each exposure sees a given sky point at a different wavelength.
- 6 detectors (D1–D6), 2040×2040 px, **6.15″/px**, PSF FWHM ≈ 9″.

| Detector / band | λ (µm) | R |
| --- | --- | --- |
| D1 | 0.75–1.09 | 39 |
| D2 | 1.10–1.62 | 41 |
| D3 | 1.63–2.41 | 41 |
| D4 | 2.42–3.82 | 35 |
| D5 | 3.83–4.41 | 112 |
| D6 | 4.42–5.00 | 128 |

## Releases (use DR1 + QR3)

| When | Release | Notes |
| --- | --- | --- |
| Nov 2026 | DR1 | Surveys 1–2 reprocessed, adds All-Sky Cube |
| Sep 2026 → weekly | QR3 | Surveys 3–4, same pipeline as DR1 |
| Oct 2025 → | QR2 | old calibration, download-only until Feb 2027, not in SIA2; mixing with DR1/QR3 needs flux-correction files |
| Jul 2025–Feb 2026 | QR1 | retired |
| ~Aug 2027 (plan) | High Reliability Source Catalog v1 | no source catalog exists yet |

New data is ingested **weekly**. SIA2 lags ~1 day; TAP does not.

## Level 2 Spectral Image (MEF FITS, ~70 MB each, one per detector per pointing)

File name: `level2_<PlanningPeriod>_<LargeSlew>_<SmallSlew>_<n>D<det>_spx_l2b-v<ver>-<YYYY-DDD>.fits`

| HDU | Content |
| --- | --- |
| IMAGE | calibrated surface brightness, MJy/sr, **zodi NOT subtracted** |
| FLAGS | per-pixel bitmask (definitions: Explanatory Supplement Table 16) |
| VARIANCE | (MJy/sr)² |
| ZODI | zodiacal model, MJy/sr (subtract yourself) |
| EPSF | position-dependent PSFs (DR1/QR3), 33×33, 5× oversampled |
| WCS-WAVE | pixel → wavelength lookup table |

- Spectral WCS: `WCS(header, fobj=hdulist, key="W")`, set `.sip = None`, then `pixel_to_world(x, y)` gives central wavelength (as in the cutouts notebook). Calibration files CWAVE/CBAND also exist.
- FITS keywords are 1-based, numpy/astropy arrays 0-based.
- Header keys: `DATE`, `DETECTOR`, `OBSID`, `PSF_FWHM`; primary `VERSION` (≥7.0 has EPSF).
- Pixel solid angle varies; official map: `s3://nasa-irsa-spherex/dr1/solid_angle_pixel_map/...` (≈16 MB/detector). Constant 6.15² ≈ 37.8 arcsec² is an approximation.
- All-Sky Cube (DR1): 12,288 HEALPix order-5 NESTED tiles, 512×512×102, 12.9″/px, zodi-subtracted, **all epochs combined (not usable for blinking)**. HiPS for display: `https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube`.

## Access

All data free, no account, no AWS egress charges. Cite DOIs (DR1 images 10.26131/IRSA678, DR1 cube 10.26131/IRSA679, QR3 10.26131/IRSA662) and IRSA acknowledgement; terms: https://irsa.ipac.caltech.edu/data_use_terms.html

### TAP (recommended for time-ordered search, no lag)

Endpoint `https://irsa.ipac.caltech.edu/TAP`, tables `spherex.plane`, `spherex.artifact`. From the official cutouts notebook:

```sql
SELECT 'https://irsa.ipac.caltech.edu/' || a.uri || '?center={ra},{dec}d&size={size_deg}' AS uri,
       p.time_bounds_lower
FROM spherex.artifact a
JOIN spherex.plane p ON a.planeid = p.planeid
WHERE 1 = CONTAINS(POINT('ICRS', {ra}, {dec}), p.poly)
  AND p.energy_bandpassname = 'SPHEREx-D2'
ORDER BY p.time_bounds_lower
```

- Python: `from astroquery.ipac.irsa import Irsa; Irsa.query_tap(query)` or `pyvo.dal.TAPService("https://irsa.ipac.caltech.edu/TAP").search(query)`.
- `time_bounds_lower` is in days (MJD assumed, *unverified* time system). `p.provenance_version` also available.
- Set `astroquery.ipac.irsa.conf.remote_timeout = 120`.
- Notebook timings: 84 rows for D2 at one position in ~20 s; all bands at one position 454 rows in ~37 s.

### SIA2

`https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_dr1&POS=circle+RA+DEC+R&RESPONSEFORMAT=...`
Collections: `spherex_dr1`, `spherex_dr1_deep`, `spherex_dr1_cube`, `spherex_qr3`, `spherex_qr3_deep`.
Python: `Irsa.query_sia(pos=(coord, radius), collection=['spherex_dr1', 'spherex_qr3'])`.
Columns include `access_url`, `cloud_access` (JSON with S3 bucket/key), `t_min`, `t_max`, `energy_bandpassname` (e.g. `SPHEREx-D2`), `em_min`, `em_max`, `obs_id`, `s_region`. One test position returned 443 images.

### Cutout service

Append `?center=<ra>,<dec>d&size=<deg>` to an on-prem `access_url`. Returns a MEF with all HDUs (PSF HDU unmodified). A 0.01° cutout ≈ 6×6 px.
- Serial: 84 cutouts in 2.26 min. `ThreadPoolExecutor(max_workers=10)`: 0.22 min. Notebook recommends 7–12 workers on 8 cores.
- Frequent `TimeoutError`, `HTTPError`, `http.client.IncompleteRead`, `RemoteDisconnected`: retry with backoff (`sleep(10 * (attempt+1))`).
- Team measured ≈8 s per cutout and frequent 503s.

### AWS S3 (anonymous) — fallback when IRSA is slow

- Bucket `nasa-irsa-spherex`, region us-east-1, prefixes `dr1/`, `qr3/`, `qr2/` (verified listable anonymously on 2026-11-14). Same tree as `https://irsa.ipac.caltech.edu/ibe/data/spherex/`.
- `aws s3 ls --no-sign-request s3://nasa-irsa-spherex/dr1/level2/`
- `fits.open('s3://...', fsspec_kwargs={"anon": True})`; with `use_fsspec=True` + `.section[...]` only needed bytes are read.

### Other tools

- SPHEREx Data Explorer (web UI): https://irsa.ipac.caltech.edu/applications/spherex
- MOST (Moving Object Search Tool), predicts which SPHEREx images contain a solar-system object: https://irsa.ipac.caltech.edu/applications/MOST (no documented API)
- Notebooks: https://caltech-ipac.github.io/irsa-tutorials/spherex/ (intro, cutouts, psf, source-discovery, mosaic, hipscube). No time-domain notebook.

## Blink pipeline (what a frame is)

1. TAP search for one detector at the target position, ordered by time.
2. Cluster `time_bounds_lower` into observing epochs (each ~6-month visit is a cluster of a few days; Deep Fields have many more).
3. Download cutouts in parallel with retries.
4. Mask with FLAGS, subtract ZODI, reproject to a common grid, median/mean co-add per epoch × detector.
5. Render PNGs with **one shared min/max/stretch for all frames of the job**; return JSON metadata (dates, detector, λ range, n_images, flagged fraction).

## Test targets (approximate, from memory, not verified against SIMBAD)

| Target | Type | Proper motion | Shift per 6 mo | Shift over 2 yr |
| --- | --- | --- | --- | --- |
| Barnard's Star | M dwarf, ~1.8 pc | ~10.4″/yr | ~0.85 px | ~3.4 px |
| WISE 0855−0714 | Y dwarf, ~2.3 pc | ~8.1″/yr | ~0.65 px | ~2.6 px |
| Epsilon Indi Ba/Bb | brown dwarf pair | ~4.7″/yr | ~0.4 px | ~1.5 px |
| RW Aurigae | T Tauri variable | negligible | brightness change | brightness change |
| R Draconis | Mira variable | negligible | brightness change | brightness change |

Team design doc values: Barnard's Star ~2026 position RA 269.446, Dec +4.767; WISE 0855 today ~RA 133.760, Dec −7.242. R Draconis: 2493 images, 55 epoch clusters (team test).

## Overlays

- Gaia DR3: ESA TAP `https://gea.esac.esa.int/tap-server/tap`, table `gaiadr3.gaia_source` (ra, dec, pmra, pmdec, parallax; ref epoch 2016.0). Propagate positions to the SPHEREx epoch. Or `astroquery.gaia`. MAST also serves Gaia.
- Aladin Lite v3 (CDS, GPL-3): HiPS + VOTable overlays in the browser; may make a Gaia endpoint unnecessary.
- CDS hips2fits: `https://alasky.cds.unistra.fr/hips-image-services/hips2fits` (params `hips, ra, dec, fov, width, height, projection, format, stretch`; max 50 Mpx) for WISE/2MASS comparison frames.
