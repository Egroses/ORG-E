"""Access to the IRSA SPHEREx archive: image listing (SIA) and cutout download."""
import http.client
import re
import time
from dataclasses import dataclass

import truststore

truststore.inject_into_ssl()  # use the OS certificate store; TLS verification stays on

import astropy.units as u  # noqa: E402
import requests  # noqa: E402
from astropy.coordinates import SkyCoord  # noqa: E402
from astropy.utils.data import conf as astropy_conf  # noqa: E402
from astroquery.ipac.irsa import Irsa  # noqa: E402

from . import store  # noqa: E402
from .config import (  # noqa: E402
    COLLECTIONS, DEFAULT_RETRY_AFTER, MAX_ATTEMPTS, REQUEST_TIMEOUT,
)

astropy_conf.remote_timeout = 120
Irsa.timeout = 300


@dataclass(frozen=True)
class Image:
    file: str
    access_url: str
    obs_id: str
    detector: int
    collection: str  # "dr1" or "qr3"
    t_min: float


class FetchError(RuntimeError):
    pass


def list_images(ra, dec):
    """All DR1/QR3 spectral images covering (ra, dec), sorted by (t_min, file)."""
    coord = SkyCoord(ra, dec, unit="deg")
    table = None
    for attempt in range(1, 6):
        try:
            table = Irsa.query_sia(pos=(coord, 1 * u.arcsec), collection=COLLECTIONS)
            break
        except Exception:  # transient archive errors; the last one is re-raised
            if attempt == 5:
                raise
            time.sleep(DEFAULT_RETRY_AFTER)
    images = []
    for row in table:
        url = str(row["access_url"])
        band = re.search(r"D(\d)$", str(row["energy_bandpassname"]))
        if band is None:
            continue
        images.append(Image(
            file=url.rsplit("/", 1)[-1],
            access_url=url,
            obs_id=str(row["obs_id"]),
            detector=int(band.group(1)),
            collection=str(row["obs_collection"]).replace("spherex_", ""),
            t_min=float(row["t_min"]),
        ))
    images.sort(key=lambda image: (image.t_min, image.file))
    return images


def cutout_url(access_url, ra, dec, size_deg):
    return f"{access_url}?center={ra:.6f},{dec:.6f}&size={size_deg:g}"


def _retry_after(response):
    try:
        return max(0.0, float(response.headers.get("Retry-After", DEFAULT_RETRY_AFTER)))
    except ValueError:
        return float(DEFAULT_RETRY_AFTER)


def new_session():
    session = requests.Session()
    session.headers["User-Agent"] = "spherex-pipeline/1.0"
    return session


def fetch_cutout(session, url, dest):
    """Download one cutout and store it at dest; retry per SPEC section 7."""
    last = "no attempt"
    for attempt in range(1, MAX_ATTEMPTS + 1):
        wait = float(DEFAULT_RETRY_AFTER)
        try:
            response = session.get(url, timeout=REQUEST_TIMEOUT)
            if response.status_code == 200:
                store.write_cutout(response.content, dest)
                return
            last = f"HTTP {response.status_code}"
            if response.status_code in (429, 503):
                wait = _retry_after(response)
        except (requests.RequestException, http.client.HTTPException, store.BadCutout, OSError) as exc:
            last = f"{type(exc).__name__}: {str(exc)[:120]}"
        if attempt < MAX_ATTEMPTS:
            time.sleep(wait)
    raise FetchError(f"{last} after {MAX_ATTEMPTS} attempts")
