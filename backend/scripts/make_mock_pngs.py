"""Generate synthetic mock frames: a star field with Barnard's Star moving north.

Run from backend/: python -m scripts.make_mock_pngs
Same grid and shared display range as the mock job, so the frontend sees realistic sizes.
Replace with real SPHEREx frames once imaging produces them.
"""

import numpy as np
from PIL import Image

from app.mock import MOCK_DATA, MOCK_DISPLAY_RANGE, MOCK_GRID, mock_frames

PSF_SIGMA_PX = 9.0 / 2.355 / MOCK_GRID.scale_arcsec  # PSF FWHM ~9 arcsec
NOISE = 0.05  # MJy/sr
STAR_PEAK = 60.0


def star(shape, x, y, peak):
    yy, xx = np.indices(shape)
    return peak * np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * PSF_SIGMA_PX ** 2))


def asinh_png(data, vmin, vmax, a=0.1):
    x = np.clip((data - vmin) / (vmax - vmin), 0, 1)
    return (255 * np.arcsinh(x / a) / np.arcsinh(1 / a)).astype(np.uint8)


def main():
    rng = np.random.default_rng(42)
    shape = (MOCK_GRID.height, MOCK_GRID.width)
    cx, cy = (MOCK_GRID.width - 1) / 2, (MOCK_GRID.height - 1) / 2

    field = np.zeros(shape)
    for _ in range(35):
        x, y = rng.uniform(0, MOCK_GRID.width), rng.uniform(0, MOCK_GRID.height)
        field += star(shape, x, y, rng.lognormal(0.0, 1.2))

    pmra, pmdec = -801.551, 10362.394  # mas/yr
    stacks = []
    for frame in mock_frames("mock"):
        year = 2000.0 + (frame.mjd_mean - 51544.5) / 365.25
        dt = year - 2026.0
        # screen coordinates: north up, east left
        x = cx - pmra / 1000 * dt / MOCK_GRID.scale_arcsec
        y = cy - pmdec / 1000 * dt / MOCK_GRID.scale_arcsec
        stack = field + star(shape, x, y, STAR_PEAK) + rng.normal(0, NOISE, shape)
        stacks.append(stack)
        img = asinh_png(stack, MOCK_DISPLAY_RANGE.min, MOCK_DISPLAY_RANGE.max)
        Image.fromarray(img, mode="L").save(MOCK_DATA / f"frame_{frame.n}.png")

    diff = stacks[-1] - stacks[0]
    sigma = NOISE * np.sqrt(2)
    gray = np.clip(0.5 + diff / (10 * sigma), 0, 1)
    Image.fromarray((255 * gray).astype(np.uint8), mode="L").save(MOCK_DATA / "diff.png")
    print(f"wrote {len(stacks)} frames + diff.png to {MOCK_DATA}")


if __name__ == "__main__":
    main()
