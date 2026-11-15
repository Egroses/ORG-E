"""pipeline/s3.py on a small synthetic SPHEREx-like file served from memory (no network)."""

import io

import numpy as np
import pytest
from astropy.io import fits

from app import config  # noqa: F401  (puts the repo root on sys.path)
from pipeline import s3, store
from pipeline.config import LAYERS

N = 400  # image size (the real images are 2040 x 2040)
C = N / 2 + 0.5  # reference pixel (1-based) at the image centre


def sphere_file():
    rng = np.random.default_rng(1)
    wcs = {"CTYPE1": "RA---TAN", "CTYPE2": "DEC--TAN", "CRVAL1": 10.0, "CRVAL2": 20.0, "CRPIX1": C,
           "CRPIX2": C, "CDELT1": -6.15 / 3600, "CDELT2": 6.15 / 3600, "CRPIX1W": 1, "CRPIX2W": 1,
           "MJD-AVG": 61000.5, "DATE-AVG": "2026-02-10T12:00:00"}
    image = rng.normal(size=(N, N)).astype(">f4")
    flags = rng.integers(0, 2 ** 20, size=(N, N)).astype(np.int32)
    primary = fits.PrimaryHDU()
    primary.header["VERSION"] = "7.0.5"
    hdus = [primary, fits.ImageHDU(image, header=fits.Header(wcs), name="IMAGE")]
    flag_header = fits.Header(wcs)
    flag_header["MSKN0000"] = "TRANSIENT"
    hdus.append(fits.CompImageHDU(flags, header=flag_header, name="FLAGS", compression_type="RICE_1",
                                  tile_shape=(1, N)))
    hdus.append(fits.ImageHDU((image * 2).astype(">f4"), header=fits.Header(wcs), name="VARIANCE"))
    hdus.append(fits.ImageHDU((image * 3).astype(">f4"), header=fits.Header(wcs), name="ZODI"))
    hdus.append(fits.BinTableHDU.from_columns([fits.Column("PSF", "4E", array=np.zeros((3, 4)))], name="EPSF"))
    hdus.append(fits.BinTableHDU.from_columns([fits.Column("X", "9J", array=np.arange(9)[None]),
                                               fits.Column("VALUES", "4E", array=np.ones((1, 4)))], name="WCS-WAVE"))
    buffer = io.BytesIO()
    fits.HDUList(hdus).writeto(buffer)
    return buffer.getvalue(), image, flags


@pytest.fixture
def served(monkeypatch):
    content, image, flags = sphere_file()
    reads = []

    def fake_get(session, url, start, length):
        reads.append(length)
        return content[start:start + length]

    monkeypatch.setattr(s3, "_get", fake_get)
    return content, image, flags, reads


def test_cutout_matches_a_direct_slice(served):
    content, image, flags, reads = served
    url = "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/x/y/6/file.fits"
    out = fits.open(io.BytesIO(s3.cutout_bytes(None, url, 10.0, 20.0, 0.1)))
    assert [h.name for h in out] == LAYERS
    cut = out["IMAGE"]
    x0 = int(round(C - cut.header["CRPIX1"]))
    y0 = int(round(C - cut.header["CRPIX2"]))
    ny, nx = cut.data.shape
    assert 57 <= nx <= 60 and 57 <= ny <= 60 and abs(x0 + nx / 2 - N / 2) <= 1.5
    assert np.array_equal(cut.data, image[y0:y0 + ny, x0:x0 + nx])
    assert np.array_equal(out["FLAGS"].data, flags[y0:y0 + ny, x0:x0 + nx])  # RICE tiles decoded
    assert np.array_equal(out["ZODI"].data, (image * 3)[y0:y0 + ny, x0:x0 + nx])
    assert out["FLAGS"].header["MSKN0000"] == "TRANSIENT" and "ZCMPTYPE" not in out["FLAGS"].header
    assert out["IMAGE"].header["CRPIX1W"] == 1 - x0  # spectral lookup shifted like IRSA does
    assert sum(reads) < len(content) / 2  # only part of the file was read


def test_stored_like_an_irsa_cutout(served, tmp_path):
    url = "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/x/y/6/file.fits"
    dest = tmp_path / "file.fits"
    s3.fetch_cutout(None, url, 10.0, 20.0, 0.1, dest)
    with fits.open(dest) as hdul:
        assert [h.name for h in hdul] == LAYERS and hdul["IMAGE"].header["MJD-AVG"] == 61000.5


def test_position_off_the_image_is_an_s3_error(served):
    url = "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/x/y/6/file.fits"
    with pytest.raises(s3.S3Error):
        s3.cutout_bytes(None, url, 30.0, 20.0, 0.1)


def test_s3_address():
    url = "https://irsa.ipac.caltech.edu/ibe/data/spherex/qr3/level2/2026W34_2A/l2b-v27-2026-243/1/f.fits?center=1,2"
    assert s3.s3_url(url) == "https://nasa-irsa-spherex.s3.amazonaws.com/qr3/level2/2026W34_2A/l2b-v27-2026-243/1/f.fits"
    with pytest.raises(s3.S3Error):
        s3.s3_url("https://example.org/f.fits")
