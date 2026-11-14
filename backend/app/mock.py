"""Mock API for jobs, frames and analysis: fixed responses in the real format,
returned regardless of parameters (targets and resolve are real, see api.py).

Lets the frontend work before the pipeline and imaging code are wired in.
The PNGs in mock_data/ are synthetic (see scripts/make_mock_pngs.py).
"""

from datetime import date
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

from .errors import ApiError
from .models import (DisplayRange, Frame, GaiaSource, Grid, Job, JobRequest, Progress,
                     SkyPosition, SpectrumPoint)
from .targets import TARGETS

MOCK_DATA = Path(__file__).resolve().parents[1] / "mock_data"

BARNARD = next(t for t in TARGETS if t.key == "barnard")

MOCK_GRID = Grid(ra=BARNARD.ra, dec=BARNARD.dec, scale_arcsec=3.075, width=117, height=117)
MOCK_DISPLAY_RANGE = DisplayRange(min=-0.1, max=48.0, stretch="asinh")
MOCK_DATA_RELEASE = "dr1+qr3@2026-11-10"

# Barnard's Star D6 epochs measured on 14 Nov; n_images and flagged_fraction are made up.
MOCK_EPOCHS = [
    ("2025-08-15", "2025-10-01", 20, 0.03),
    ("2026-03-11", "2026-05-05", 21, 0.02),
    ("2026-08-16", "2026-09-22", 17, 0.04),
]


def _mjd(day: str) -> float:
    return float((date.fromisoformat(day) - date(1858, 11, 17)).days)


def mock_frames(job_id: str) -> list:
    return [
        Frame(
            n=n,
            url=f"/api/frames/{job_id}/{n}.png",
            t_start=t_start,
            t_end=t_end,
            mjd_mean=round((_mjd(t_start) + _mjd(t_end)) / 2, 1),
            detector=6,
            wavelength_um=[4.41, 5.00],
            n_images=n_images,
            flagged_fraction=flagged,
        )
        for n, (t_start, t_end, n_images, flagged) in enumerate(MOCK_EPOCHS)
    ]


def mock_job(job_id: str = "mock") -> Job:
    frames = mock_frames(job_id)
    total = sum(f.n_images for f in frames)
    return Job(
        id=job_id,
        status="done",
        data_release=MOCK_DATA_RELEASE,
        progress=Progress(total=total, done=total, failed=0),
        center=SkyPosition(ra=BARNARD.ra, dec=BARNARD.dec),
        grid=MOCK_GRID,
        display_range=MOCK_DISPLAY_RANGE,
        frames=frames,
    )


def mock_running_job() -> Job:
    job = mock_job("mock-running")
    job.status = "running"
    job.progress = Progress(total=job.progress.total, done=1, failed=0)
    job.frames = job.frames[:1]
    return job


router = APIRouter(prefix="/api")


@router.post("/jobs", response_model=Job)
def create_job(request: JobRequest):
    return mock_job()


@router.get("/jobs/{job_id}", response_model=Job)
def get_job(job_id: str):
    if job_id == "mock-running":
        return mock_running_job()
    if job_id == "mock-error":
        raise ApiError("no_coverage", "SPHEREx has no images of this position in this detector yet.")
    return mock_job(job_id)


@router.get("/frames/{job_id}/{n}.png")
def get_frame(job_id: str, n: int):
    if not 0 <= n < len(MOCK_EPOCHS):
        raise ApiError("not_found", f"Frame {n} does not exist.")
    return FileResponse(MOCK_DATA / f"frame_{n}.png", media_type="image/png")


@router.get("/diff")
def get_diff(job: str, a: int = 0, b: int = len(MOCK_EPOCHS) - 1):
    return FileResponse(MOCK_DATA / "diff.png", media_type="image/png")


@router.get("/spectrum", response_model=list[SpectrumPoint])
def spectrum(ra: float, dec: float):
    # Smooth made-up spectrum: 17 points per detector, three epochs for D6.
    points = []
    bands = [(1, 0.75, 1.09), (2, 1.10, 1.62), (3, 1.63, 2.41), (4, 2.42, 3.82), (5, 3.83, 4.41), (6, 4.42, 5.00)]
    for detector, lo, hi in bands:
        for i in range(17):
            wl = lo + (hi - lo) * i / 16
            flux = 900.0 * wl ** -1.6
            points.append(SpectrumPoint(wavelength_um=round(wl, 4), flux_mjy=round(flux, 2),
                                        err_mjy=round(0.03 * flux + 1.0, 2), mjd=_mjd("2025-09-08"),
                                        detector=detector, flagged=detector <= 2 and i % 5 == 0))
    return points


@router.get("/lightcurve", response_model=list[SpectrumPoint])
def lightcurve(ra: float, dec: float, detector: int = 6):
    # Made-up Mira-like curve (period ~245 d) sampled at 12 epochs.
    import math

    start = _mjd("2025-05-10")
    return [
        SpectrumPoint(wavelength_um=4.7, flux_mjy=round(4000 + 2500 * math.sin(2 * math.pi * k * 45 / 245), 1),
                      err_mjy=40.0, mjd=start + k * 45, detector=detector, flagged=False)
        for k in range(12)
    ]


@router.get("/gaia", response_model=list[GaiaSource])
def gaia(ra: float, dec: float, radius: float = 0.05):
    return [
        GaiaSource(source_id="4472832130942575872", ra=BARNARD.ra, dec=BARNARD.dec,
                   gmag=8.19, pmra=BARNARD.pmra, pmdec=BARNARD.pmdec),
        GaiaSource(source_id="mock-1", ra=BARNARD.ra + 0.012, dec=BARNARD.dec - 0.008,
                   gmag=14.2, pmra=-2.1, pmdec=-4.0),
        GaiaSource(source_id="mock-2", ra=BARNARD.ra - 0.020, dec=BARNARD.dec + 0.015,
                   gmag=15.8, pmra=1.3, pmdec=0.6),
    ]
