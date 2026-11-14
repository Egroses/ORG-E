"""Mock jobs for frontend states: mock (done), mock-running and mock-error.

Served through the real job routes in jobs.py. The PNGs in mock_data/ are real Barnard's Star
D6 frames (three full epochs of the real job, copied by scripts/make_mock_pngs.py); the metadata
below matches them.
"""

from pathlib import Path

from fastapi.responses import FileResponse

from .errors import ApiError
from .models import DisplayRange, Frame, Grid, Job, Progress, SkyPosition
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
