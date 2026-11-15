"""Cutouts read straight from the SPHEREx images on AWS S3 (anonymous, public bucket).

IRSA keeps a copy of every SPHEREx file in the AWS Open Data bucket `nasa-irsa-spherex` (us-east-1),
same tree as https://irsa.ipac.caltech.edu/ibe/data/spherex/. Instead of asking IRSA's cutout
service to cut a 65 MB image (~17 s per request, 3 connections), only the bytes around the position
are read with HTTP range requests:

- IMAGE, VARIANCE and ZODI are plain 2040x2040 float32 arrays: one range of whole rows each;
- FLAGS is RICE-compressed with one tile per row: the rows' tile descriptors, then their bytes,
  decompressed with astropy's codec;
- PRIMARY and WCS-WAVE (a 720-byte table) are read whole.

The stored file has the same layers and headers as an IRSA cutout (LAYERS); like IRSA, CRPIX1/2,
CRPIX1A/2A and CRPIX1W/2W are shifted by the cut, the WCS-WAVE table is unchanged. The cut is the
box of +-size/2 around the position, clipped to the image (IRSA's own box can differ by one pixel).
Checked on 15 Nov 2026 against IRSA cutouts of Barnard's Star: identical pixels.

Measured from Turkey on 15 Nov: 0.53 s per file with 20 connections (IRSA cutouts: 5.6 s per file
with 3), about 1.8 MB read per file instead of 65 MB.
"""
import io
import math
import time
import warnings

import numpy as np
import requests
from astropy.io import fits
from astropy.wcs import WCS, FITSFixedWarning

from . import store

BUCKET_URL = "https://nasa-irsa-spherex.s3.amazonaws.com/"
IRSA_PREFIX = "/ibe/data/spherex/"
CONNECTIONS = 20
ATTEMPTS = 3
TIMEOUT = 60
BLOCK = 2880
PLAIN = ("IMAGE", "VARIANCE", "ZODI")
WANTED = {"PRIMARY", "IMAGE", "FLAGS", "VARIANCE", "ZODI", "WCS-WAVE"}
SHIFTED = ("CRPIX1", "CRPIX1A", "CRPIX1W"), ("CRPIX2", "CRPIX2A", "CRPIX2W")
DROP = ("CHECKSUM", "DATASUM", "ZHECKSUM", "ZDATASUM")


class S3Error(Exception):
    """The S3 copy could not be read; the caller falls back to IRSA's cutout service."""


def s3_url(access_url):
    """S3 address of the file behind an IRSA access_url."""
    if IRSA_PREFIX not in access_url:
        raise S3Error(f"not an IRSA SPHEREx address: {access_url}")
    return BUCKET_URL + access_url.split("?")[0].split(IRSA_PREFIX, 1)[1]


def new_session(connections=CONNECTIONS):
    session = requests.Session()
    session.headers["User-Agent"] = "spherex-pipeline/1.0"
    session.mount("https://", requests.adapters.HTTPAdapter(pool_maxsize=connections))
    return session


def _get(session, url, start, length):
    error = None
    for attempt in range(ATTEMPTS):
        try:
            response = session.get(url, headers={"Range": f"bytes={start}-{start + length - 1}"}, timeout=TIMEOUT)
            if response.status_code == 206 and len(response.content) == length:
                return response.content
            error = f"HTTP {response.status_code}, {len(response.content)} of {length} bytes"
        except requests.RequestException as exc:
            error = f"{type(exc).__name__}: {str(exc)[:120]}"
        time.sleep(1 + attempt)
    raise S3Error(error)


def _data_size(header):
    naxis = header.get("NAXIS", 0)
    if not naxis:
        return 0
    n = 1
    for i in range(1, naxis + 1):
        n *= header[f"NAXIS{i}"]
    return abs(header["BITPIX"]) // 8 * header.get("GCOUNT", 1) * (header.get("PCOUNT", 0) + n)


def _headers(session, url):
    """{extname: (header, data offset)}, reading header blocks only, until every wanted layer is seen."""
    found, offset = {}, 0
    for _ in range(12):
        raw, end = b"", None
        while end is None:
            raw += _get(session, url, offset + len(raw), BLOCK * 2)
            end = next((i * 80 for i in range(len(raw) // 80) if raw[i * 80:i * 80 + 80].rstrip() == b"END"), None)
            if len(raw) > BLOCK * 40:
                raise S3Error("no END card in a header")
        header = fits.Header.fromstring(raw[:end + 80].decode("ascii"))
        data_offset = offset + (end // BLOCK + 1) * BLOCK
        found[header.get("EXTNAME", "PRIMARY")] = (header, data_offset)
        if WANTED <= set(found):
            return found
        offset = data_offset + (_data_size(header) + BLOCK - 1) // BLOCK * BLOCK
    raise S3Error(f"layers missing: {sorted(WANTED - set(found))}")


def _cut_header(header, x0, y0):
    header = header.copy()
    for keys, shift in zip(SHIFTED, (x0, y0)):
        for key in keys:
            if key in header:
                header[key] = header[key] - shift
    for key in DROP:
        header.remove(key, ignore_missing=True)
    return header


def _flags(session, url, header, offset, y0, y1, x0, x1):
    """Rows y0..y1 of the RICE-compressed FLAGS (one tile per row), columns x0..x1, as int32."""
    from astropy.io.fits.hdu.compressed._codecs import Rice1

    if header.get("ZCMPTYPE") != "RICE_1" or header.get("ZTILE2", 1) != 1 or header["ZTILE1"] != header["ZNAXIS1"]:
        raise S3Error("FLAGS is not stored as RICE tiles of one row")
    row_bytes = header["NAXIS1"]
    table = np.frombuffer(_get(session, url, offset + y0 * row_bytes, (y1 - y0 + 1) * row_bytes), dtype=">i4")
    sizes, starts = table.reshape(-1, row_bytes // 4)[:, 0], table.reshape(-1, row_bytes // 4)[:, 1]
    heap = offset + header.get("THEAP", header["NAXIS1"] * header["NAXIS2"])
    lo, hi = int(starts.min()), int((starts + sizes).max())
    blob = np.frombuffer(_get(session, url, heap + lo, hi - lo), dtype=np.uint8)
    codec = Rice1(blocksize=header.get("ZVAL1", 32), bytepix=header.get("ZVAL2", 4), tilesize=header["ZNAXIS1"])
    rows = [np.asarray(codec.decode(blob[s - lo:s - lo + n])).view(np.int32) for n, s in zip(sizes, starts)]
    return np.stack(rows)[:, x0:x1 + 1]


def _flags_header(header):
    """Image header of a tile-compressed HDU (what IRSA's cutouts carry)."""
    skip = {"XTENSION", "BITPIX", "NAXIS", "NAXIS1", "NAXIS2", "PCOUNT", "GCOUNT", "TFIELDS", "THEAP", *DROP}
    out = fits.Header()
    for card in header.cards:
        key = card.keyword
        if key in skip or key.startswith(("TTYPE", "TFORM", "TUNIT", "TDIM", "Z")):
            continue
        out.append(card)
    return out


def cutout_bytes(session, access_url, ra, dec, size_deg):
    """A cutout FITS file (bytes, layers as store.LAYERS) made from the S3 copy of one image."""
    url = s3_url(access_url)
    layers = _headers(session, url)
    image_header, _ = layers["IMAGE"]
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", FITSFixedWarning)
        x, y = (float(v) for v in WCS(image_header).all_world2pix(ra, dec, 0))
        scale = abs(WCS(image_header).proj_plane_pixel_scales()[0].to_value("deg")) or 6.15 / 3600
    half = size_deg / 2 / scale
    nx, ny = image_header["NAXIS1"], image_header["NAXIS2"]
    x0, x1 = max(math.ceil(x - half), 0), min(math.floor(x + half), nx - 1)
    y0, y1 = max(math.ceil(y - half), 0), min(math.floor(y + half), ny - 1)
    if x1 < x0 or y1 < y0:
        raise S3Error("the position is outside this image")

    hdus = [fits.PrimaryHDU(header=layers["PRIMARY"][0])]
    for name in ("IMAGE", "FLAGS", "VARIANCE", "ZODI"):
        header, offset = layers[name]
        if name in PLAIN:
            row = header["NAXIS1"] * 4
            data = np.frombuffer(_get(session, url, offset + y0 * row, (y1 - y0 + 1) * row), dtype=">f4")
            data = data.reshape(-1, header["NAXIS1"])[:, x0:x1 + 1]
            hdus.append(fits.ImageHDU(data=np.ascontiguousarray(data), header=_cut_header(header, x0, y0)))
        else:
            data = _flags(session, url, header, offset, y0, y1, x0, x1)
            hdus.append(fits.ImageHDU(data=np.ascontiguousarray(data),
                                      header=_cut_header(_flags_header(header), x0, y0)))
    wave_header, wave_offset = layers["WCS-WAVE"]
    wave_data = _get(session, url, wave_offset, _data_size(wave_header))
    padding = b"\0" * (-len(wave_data) % BLOCK)
    raw = fits.PrimaryHDU().header.tostring().encode() + wave_header.tostring().encode() + wave_data + padding
    with fits.open(io.BytesIO(raw)) as wave:
        hdus.append(fits.BinTableHDU(data=wave[1].data.copy(), header=wave_header))

    buffer = io.BytesIO()
    fits.HDUList(hdus).writeto(buffer, checksum=False)
    return buffer.getvalue()


def fetch_cutout(session, access_url, ra, dec, size_deg, dest):
    """Read the cutout from S3 and store it at dest like a downloaded IRSA cutout."""
    try:
        store.write_cutout(cutout_bytes(session, access_url, ra, dec, size_deg), dest)
    except (S3Error, OSError, KeyError, ValueError) as exc:  # store.BadCutout is a ValueError
        raise S3Error(f"{type(exc).__name__}: {str(exc)[:160]}") from exc
