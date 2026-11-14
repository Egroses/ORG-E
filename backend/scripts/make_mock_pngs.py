"""Copy real Barnard's Star D6 frames into mock_data/ for the mock job.

Run from backend/ after the real job exists (python -m scripts.prebuild --target barnard --detector 6):
    python -m scripts.make_mock_pngs
Takes frames 0, 1, 4 (the three full epochs) and writes the diff of the first and last.
"""

import shutil

from app import config
from app.frames import write_diff_png
from app.jobs import job_id_for, normalize
from app.mock import MOCK_DATA, MOCK_SOURCE_FRAMES
from app.models import JobRequest
from app.targets import TARGETS_BY_KEY


def main():
    barnard = TARGETS_BY_KEY["barnard"]
    job_dir = config.JOBS_DIR / job_id_for(normalize(JobRequest(ra=barnard.ra, dec=barnard.dec)))
    if not (job_dir / "job.json").exists():
        raise SystemExit(f"no finished Barnard D6 job in {job_dir}; run scripts.prebuild first")
    MOCK_DATA.mkdir(exist_ok=True)
    for n, source in enumerate(MOCK_SOURCE_FRAMES):
        shutil.copyfile(job_dir / f"{source}.png", MOCK_DATA / f"frame_{n}.png")
    write_diff_png(job_dir / "stacks.npz", MOCK_SOURCE_FRAMES[0], MOCK_SOURCE_FRAMES[-1],
                   MOCK_DATA / "diff.png")
    print(f"copied frames {MOCK_SOURCE_FRAMES} and diff from {job_dir} to {MOCK_DATA}")


if __name__ == "__main__":
    main()
