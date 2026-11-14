"""Mock data: the mock / mock-running / mock-error jobs (served through jobs.py) and the
analysis endpoints (spectrum, lightcurve), which return fixed responses in the real
format regardless of parameters until the real code is written.

Lets the frontend work before the pipeline and imaging code are wired in.
The PNGs in mock_data/ are real Barnard's Star D6 frames (three full epochs of the real job,
copied by scripts/make_mock_pngs.py); the metadata below matches them.
"""

from datetime import date
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

from .errors import ApiError
from .models import (DisplayRange, Frame, Grid, Job, Progress, SkyPosition,
                     SpectrumPoint)
from .targets import TARGETS

MOCK_DATA = Path(__file__).resolve().parents[1] / "mock_data"

BARNARD = next(t for t in TARGETS if t.key == "barnard")

MOCK_GRID = Grid(ra=BARNARD.ra, dec=BARNARD.dec, scale_arcsec=3.075, width=117, height=117)
MOCK_DISPLAY_RANGE = DisplayRange(min=-0.1215, max=371.3516, stretch="asinh")
MOCK_DATA_RELEASE = "dr1+qr3@2026-08-20"

# Frames 0, 1 and 4 of the real Barnard's Star D6 job (14 Nov 2026), renumbered 0-2.
MOCK_EPOCHS = [
    dict(t_start="2025-08-15", t_end="2025-08-27", mjd_mean=60908.1338,
         wavelength_um=[4.419, 5.001], n_images=17, flagged_fraction=0.0086),
    dict(t_start="2026-03-19", t_end="2026-03-25", mjd_mean=61120.4379,
         wavelength_um=[4.412, 5.002], n_images=19, flagged_fraction=0.0047),
    dict(t_start="2026-08-16", t_end="2026-08-20", mjd_mean=61270.2824,
         wavelength_um=[4.434, 4.977], n_images=17, flagged_fraction=0.0042),
]
MOCK_SOURCE_FRAMES = [0, 1, 4]  # frame numbers in the real job that the mock PNGs come from


def _mjd(day: str) -> float:
    return float((date.fromisoformat(day) - date(1858, 11, 17)).days)


def mock_frames(job_id: str) -> list:
    return [Frame(n=n, url=f"/api/frames/{job_id}/{n}.png", detector=6, **epoch)
            for n, epoch in enumerate(MOCK_EPOCHS)]


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


# The real job routes (jobs.py) hand the ids mock / mock-running / mock-error to these.

def get_mock_job(job_id: str) -> Job:
    if job_id == "mock-running":
        return mock_running_job()
    if job_id == "mock-error":
        raise ApiError("no_coverage", "SPHEREx has no images of this position in this detector yet.")
    return mock_job(job_id)


def frame_file(n: int) -> FileResponse:
    if not 0 <= n < len(MOCK_EPOCHS):
        raise ApiError("not_found", f"Frame {n} does not exist.")
    return FileResponse(MOCK_DATA / f"frame_{n}.png", media_type="image/png")


def diff_file() -> FileResponse:
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
