# Spectrum, catalogue and live-download API (backend, 15 Nov 2026)

Answers to `docs/backend-spectrum-catalog-tasks.md`. Every change is an **addition**: old fields keep their names
and types, new parameters are optional. One meaning changed on request of that list: `flagged` (see 2).
All examples below are real answers from the local cache (five targets, 15 Nov). JSON never holds NaN or Infinity;
an unknown value is `null`.

## 1. SPHEREx flag bits (from the FITS headers)

Every cutout's `FLAGS` header names its bits (`MSKN*`) and describes them (`MSKD*`). Read on 15 Nov from a
Barnard's Star D6 cutout:

| Bit | Name | Header description | Spectrum policy |
| --- | --- | --- | --- |
| 0 | TRANSIENT | Transient detected during SUR | listed only |
| 1 | OVERFLOW | Overflow detected during SUR | saturation |
| 2 | SUR_ERROR | Error in onboard processing | saturation |
| 6 | NONFUNC | Permanently unusable | hard |
| 7 | DICHROIC | Low efficiency due to dichroic | listed only |
| 9 | MISSING_DATA | Onboard data lost | hard |
| 10 | HOT | Hot pixel | hard |
| 11 | COLD | Anomalously low signal | hard |
| 12 | FULLSAMPLE | Pixel full sample history is available | not listed (status) |
| 14 | PHANMISS | Phantom correction was not applied | hard |
| 15 | NONLINEAR | Nonlinearity correction cannot be applied reliably | listed only |
| 17 | PERSIST | Persistent charge above threshold | hard |
| 19 | OUTLIER | Pixel flagged by Detect Outliers | hard |
| 20 | CROSSTALK | Pixel affected by crosstalk | listed only |
| 21 | SOURCE | Pixel mapped to a known source | not listed (status) |
| 22-24 | GHOST, GHOST_FPA, GHOST_EXT | Affected by a bright source (inside / other detector / outside FOV) | listed only |
| 25 | STREAK | Pixel affected by a streak | hard |
| 26 | BLOOM | Pixel part of a bloom artifact | saturation |
| 27 | SNOWBALL | Pixel part of a snowball artifact | hard |
| 28 | HALO | Pixel part of a transient halo | listed only |

**TRANSIENT** means a jump was detected while the detector was read "up the ramp" (SUR = sample up the ramp: each
pixel is read many times during an exposure and the slope gives the signal). It is not about the source being
transient or moving. A bright star makes such jumps in almost every exposure (Barnard: 353 of 358), so the bit is
shown in `flag_names` but never drops a point.

## 2. Spectrum and light-curve points: new fields

`GET /api/spectrum?ra=&dec=[&pmra=&pmdec=][&aperture=]` and `GET /api/lightcurve?...&detector=[&aperture=]`.

| Field | Meaning |
| --- | --- |
| `flagged` | **changed:** a hard bit (table above) in the aperture. Before 15 Nov: any bad or saturation bit or a NaN pixel |
| `saturated` (new) | OVERFLOW, SUR_ERROR or BLOOM in the aperture |
| `masked_px` (new) | aperture pixels with no value (NaN); they are left out of the sum |
| `flag_names` (new) | every bit set in the aperture, in bit order (FULLSAMPLE and SOURCE left out) |
| `lower_limit` (new) | `saturated` or `masked_px > 0`: the true flux may be higher |
| `aperture` (new parameter) | aperture radius in detector pixels (6.15″), 1-3, default 2; outside: `400 bad_input` |

Barnard's Star D6, two points:

```json
[{"wavelength_um": 4.412, "flux_mjy": 4510.5783, "err_mjy": 12.5349, "mjd": 61122.65479, "detector": 6,
  "flagged": false, "saturated": true, "masked_px": 0,
  "flag_names": ["TRANSIENT", "OVERFLOW", "SUR_ERROR", "BLOOM"], "lower_limit": true},
 {"wavelength_um": 0.7673, "flux_mjy": 2625.4152, "err_mjy": 11.1202, "mjd": 60948.6539, "detector": 1,
  "flagged": true, "saturated": true, "masked_px": 1,
  "flag_names": ["TRANSIENT", "OVERFLOW", "SUR_ERROR", "PERSIST", "BLOOM"], "lower_limit": true}]
```

Counts on the five targets (aperture 2 px, with proper motion):

| Target | Points | `flagged` | `saturated` | NaN in aperture | `lower_limit` | clean (neither) |
| --- | --- | --- | --- | --- | --- | --- |
| Barnard's Star | 358 | 40 | 358 | 238 | 358 | 0 |
| Epsilon Indi B | 458 | 24 | 35 | 3 | 35 | 412 |
| WISE 0855 | 258 | 25 | 14 | 0 | 14 | 230 |
| RW Aurigae | 333 | 14 | 315 | 0 | 315 | 18 |
| R Draconis | 1257 | 100 | 1257 | 1250 | 1257 | 0 |

Most common bits: Barnard OVERFLOW 357, TRANSIENT 353, BLOOM 353, SUR_ERROR 351, NONFUNC 21, PERSIST 14;
R Dra OVERFLOW / SUR_ERROR / BLOOM 1257, TRANSIENT 971; Eps Indi B HALO 80, TRANSIENT 62; WISE 0855 TRANSIENT 18,
NONFUNC 16. Barnard's Star, RW Aurigae and R Draconis are saturated in SPHEREx: their spectra are lower limits.

NaN pixels: the archive leaves the saturated core of a bright star without value. The sum uses the finite pixels
only, so such fluxes are too low (`lower_limit`). Filling them from neighbours was not done: in a saturated core the
neighbours are saturated too.

## 3. 102-channel spectrum: `mode=102`

`GET /api/spectrum?ra=&dec=[&pmra=&pmdec=]&mode=102[&aperture=2]`. Without `mode` the answer is the list above,
unchanged. Same coverage rule as the list: a position no cached cutout covers answers `404 no_coverage`.

Method:
- 17 channels per detector, evenly spaced in log(wavelength) (constant resolving power within a detector) over the
  range the cached cutouts cover (measured on Barnard's Star): D1 0.74-1.11, D2 1.08-1.67, D3 1.62-2.42,
  D4 2.41-3.81, D5 3.80-4.43, D6 4.41-5.01 µm. This is close to, but not exactly, the official SPHEREx channels.
- Each exposure is measured as in 2 (aperture photometry at the source position moved by its proper motion to the
  exposure's date) and goes into the channel of its wavelength.
- Channel flux = **median** of the exposures without a hard bit; those with one are counted in `n_skipped`.
  Error = 1.2533 × sqrt(Σ err²) / N (error of the median of N Gaussian values).
- No usable exposure: `flux_mjy` and `err_mjy` are `null`.
- `saturated` / `lower_limit`: at least one exposure in the median has it.

```json
{"center": {"ra": 269.446271, "dec": 4.768197}, "aperture_px": 2.0, "unit": "mJy",
 "channels": [
   {"detector": 1, "index": 0, "wavelength_um": 0.7489, "wavelength_range_um": [0.74, 0.7579],
    "flux_mjy": 2212.0149, "err_mjy": 5.8328, "n_exposures": 4, "n_skipped": 0, "saturated": true, "lower_limit": true},
   "... 102 entries, detector 1 index 0 to detector 6 index 16 ...",
   {"detector": 6, "index": 16, "wavelength_um": 4.9912, "wavelength_range_um": [4.9725, 5.01],
    "flux_mjy": 3665.17, "err_mjy": 5.0974, "n_exposures": 3, "n_skipped": 0, "saturated": true, "lower_limit": true}],
 "warnings": ["The source is saturated in some channels: their fluxes are lower limits."]}
```

Checks (middle channel of each detector, mJy):

| Target, aperture | D1 | D2 | D3 | D4 | D5 | D6 | channels with a value |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WISE 0855, 1 px | 0.31 | 0.06 | 0.39 | 0.07 | 0.34 | 0.45 | 102 |
| WISE 0855, 2 px | 1.06 | 0.91 | 0.62 | 0.20 | 0.38 | 0.63 | 102 |
| WISE 0855, 3 px | 1.05 | 0.90 | 0.62 | 0.23 | 0.43 | 0.70 | 97 |
| R Dra, 1 px | 1722 | - | - | - | - | - | 21 |
| R Dra, 2 px | 5917 | 5941 | 4467 | - | 12054 | 23281 | 79 |
| R Dra, 3 px | 15849 | 14423 | 14466 | 7322 | 34396 | 29603 | 102 |

- **WISE 0855** (very cold brown dwarf): bright at 4.5 µm, as expected (W2 ≈ 14 mag ≈ 0.5 mJy). The ~1 mJy at
  0.75-1.6 µm with the 2-px aperture is **not** the brown dwarf: Gaia DR3 5756956644387831296 (G = 16.3) is 7.3″
  away, inside the 12.3″ aperture. With a 1-px aperture (6.15″) the short-wavelength flux falls to 0.06-0.4 mJy.
  SPHEREx pixels are 6.15″; such blends are real and should be explained in the interface.
- **R Draconis** (bright Mira): the core is saturated and has no value, so small apertures find nothing
  (channels null) and larger apertures gather more of the wings. All its values are lower limits.
- Flux grows with the aperture in most channels, as it should.
- Speed: after the cutouts are in memory (`PREBUILD_ON_START=1` loads them at start) a request takes 0.2-1.3 s;
  a cold start of R Draconis (1257 cutouts) takes ~2 min.

## 4. `GET /api/catwise?ra=&dec=[&radius=0.075][&limit=500]`

CatWISE2020: WISE 3.4 µm (W1) and 4.6 µm (W2) with motions from ten years of WISE/NEOWISE. It sees cold, red objects
Gaia misses. `radius` up to 0.25 deg (else `400 bad_input`); archive down: `503 archive_unavailable`.

```json
[{"name": "J085501.95-071428.2", "ra": 133.758148, "dec": -7.2412101, "w1": 15.037, "w2": 15.202,
  "pmra": -5.88, "pmdec": -10.4, "pm_snr": 0.83},
 {"name": "J085506.91-071437.5", "ra": 133.7600592, "dec": -7.2425984, "w1": 19.456, "w2": 15.541,
  "pmra": -7919.9, "pmdec": 493.9, "pm_snr": 52.15}]
```

- Sorted by `w2`, brightest first. Positions moved to epoch 2026.0 from `ra_pm`/`dec_pm` (MJD 57170 = 2015.405).
- `pmra`, `pmdec` in **mas/yr** (CatWISE stores arcsec/yr; converted). `pm_snr = hypot(pmra/sigpmra, pmdec/sigpmdec)`.
- Sources: the five targets come from `backend/app/catwise_fields/*.csv` (no archive needed). Other positions: IRSA TAP
  (`catwise_2020`), then NOIRLab Astro Data Lab (`catwise2020.main`) when IRSA fails. On 15 Nov IRSA's TAP answered
  502, so the stored fields came from Data Lab.
- **WISE 0855 check:** CatWISE has it, but split into several entries along its track (it moves 8″/yr, faster than
  the catalogue's model expects): three entries with pmra -7920 to -8021 mas/yr and `pm_snr` 42-90, 1.4-3.6″ from the
  2026.0 position. Gaia has nothing there (too faint in the optical). That is what a WISE overlay shows.

## 5. Gaia: `pm_snr`

`/api/gaia` sources gain `pm_snr` (proper motion over its error, from `pmra_error`/`pmdec_error`; `null` when
unknown). Barnard's Star: 288384. The stored fields (`backend/app/gaia_fields/`) were regenerated with the error
columns from the GAVO mirror (ESA's archive did not answer on 15 Nov).

**Fix that also applies to both catalogues:** sources were selected by their catalogue-epoch position (Gaia 2016,
CatWISE 2015), so a small radius around a fast mover's 2026 position missed it (WISE 0855 moved ~86″ since 2015).
Now the search reaches 0.03 deg further, positions are moved to 2026.0, and only then cut to the radius.

## 6. Live download progress

While a position not in the cache downloads, `progress` in the 202 answer has, besides `total`, `done`, `failed`:
`detector_done`, `detector_total` (detectors finished / to fetch) and `eta_s` (seconds left at the speed so far;
`null` for the first five files). During stacking only `total`, `done`, `failed` (imaging's own count).

```json
{"status": "running", "id": "6da75630d286",
 "progress": {"total": 167, "done": 96, "failed": 0, "detector_done": 1, "detector_total": 3, "eta_s": 400}}
```

- `done` rises steadily from 0 to `total` once over all detectors (checked live on 15 Nov: RA 10, Dec 10,
  `dets=2,4,6`, 167 files in 15.5 min, 0 failed).
- A server restart in the middle: files already downloaded stay on disk; the next request lists the archive again and
  fetches only the rest (pipeline `sync_unit` skips files that exist).

## 7. Tests

`python -m pytest -q -rs`: 83 passed, 3 skipped on a machine with the cache. The skipped ones need the network
(`NETWORK_TESTS=1`: Gaia, SIMBAD, CatWISE; with it all 86 pass, 15 Nov). On a machine without `cache/` six more are
skipped: they measure real cutouts (Barnard's Star D6 job, Barnard patch contract, four photometry tests). That is
the "7 skipped" seen on the frontend machine before the CatWISE test was added.
