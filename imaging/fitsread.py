"""Tiny FITS reader for the cached SPHEREx cutouts (image HDUs only, numpy only).

astropy.io.fits needs about 10 ms per cutout in pure-Python header parsing, which does not
parallelise and made a 1,200-exposure patch take half a minute. This reader skips what we do not
need (tables, the unused HDUs) and takes about 1 ms. imaging/tests compare it with astropy.
AI-assisted code (Claude Code).
"""

import numpy as np

BLOCK = 2880
# Only these keywords are parsed; the headers hold ~270 cards and we need about 40.
_NEEDED = ("SIMPLE", "XTENSION", "BITPIX", "NAXIS", "PCOUNT", "EXTNAME", "BSCALE", "BZERO", "CTYPE", "CRVAL",
           "CRPIX", "CD", "PC", "LONPOLE", "A_", "B_", "MSKN")
CARD = 80
_DTYPES = {8: ">u1", 16: ">i2", 32: ">i4", 64: ">i8", -32: ">f4", -64: ">f8"}


def _parse_value(text):
    text = text.strip()
    if text.startswith("'"):
        out, i = [], 1
        while i < len(text):
            if text[i] == "'":
                if text[i + 1:i + 2] == "'":   # doubled quote = literal quote
                    out.append("'")
                    i += 2
                    continue
                break
            out.append(text[i])
            i += 1
        return "".join(out).rstrip()
    text = text.split("/")[0].strip()
    if text in ("T", "F"):
        return text == "T"
    try:
        return int(text)
    except ValueError:
        pass
    try:
        return float(text.replace("D", "E").replace("d", "e"))
    except ValueError:
        return text


class Header:
    """Read-only header whose values are parsed on first access (most are never needed)."""

    def __init__(self, raw):
        self._raw = raw

    def __getitem__(self, key):
        return _parse_value(self._raw[key])

    def get(self, key, default=None):
        return _parse_value(self._raw[key]) if key in self._raw else default

    def __contains__(self, key):
        return key in self._raw

    def keys(self):
        return self._raw.keys()


def _read_header(handle):
    """Raw card values by keyword (strings, not yet parsed); None at end of file."""
    header, done = {}, False
    first = True
    while not done:
        block = handle.read(BLOCK)
        if len(block) < BLOCK:
            if first and not block:
                return None
            raise ValueError("truncated FITS header")
        first = False
        text = block.decode("ascii", errors="replace")
        for i in range(0, BLOCK, CARD):
            key = text[i:i + 8].strip()
            if key == "END":
                done = True
                break
            if text[i + 8:i + 10] == "= " and key.startswith(_NEEDED):
                header[key.upper()] = text[i + 10:i + CARD]   # parsed later, only for wanted HDUs
    return header


def read_hdus(path, names):
    """{EXTNAME: (header dict, float/int array)} for the requested image HDUs; others are skipped."""
    wanted = set(names)
    found = {}
    with open(path, "rb") as handle:
        while True:
            raw = _read_header(handle)
            if raw is None:
                break
            lazy = {k: raw[k] for k in ("BITPIX", "NAXIS", "PCOUNT", "EXTNAME", "BSCALE", "BZERO") if k in raw}
            lazy.update({k: v for k, v in raw.items() if k.startswith("NAXIS")})
            header = {k: _parse_value(v) for k, v in lazy.items()}
            naxis = int(header.get("NAXIS", 0))
            shape = [int(header[f"NAXIS{k}"]) for k in range(naxis, 0, -1)]
            bitpix = int(header["BITPIX"])
            count = int(np.prod(shape)) if shape else 0
            nbytes = abs(bitpix) // 8 * count + int(header.get("PCOUNT", 0))
            padded = -(-nbytes // BLOCK) * BLOCK
            name = str(header.get("EXTNAME", "PRIMARY")).strip().upper()
            if name in wanted and naxis > 0:
                if bitpix not in _DTYPES or header.get("PCOUNT", 0):
                    raise ValueError(f"unsupported HDU {name}")
                buffer = handle.read(padded)
                data = np.frombuffer(buffer, dtype=_DTYPES[bitpix], count=count).reshape(shape)
                data = data.astype(data.dtype.newbyteorder("="))
                if "BSCALE" in header or "BZERO" in header:
                    data = data * header.get("BSCALE", 1.0) + header.get("BZERO", 0.0)
                found[name] = (Header(raw), data)
                if wanted <= set(found):
                    break
            else:
                handle.seek(padded, 1)
    missing = wanted - set(found)
    if missing:
        raise KeyError(f"missing HDU(s) {sorted(missing)} in {path}")
    return found
