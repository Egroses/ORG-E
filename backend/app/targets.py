"""The five challenge test targets.

`ra`/`dec` (epoch 2026.0) come from pipeline/targets.json so cache keys match the pipeline.
Catalog positions (J2000), proper motions and parallaxes were taken from SIMBAD
(Harvard mirror) on 2026-11-14. Propagating the catalog position to 2026.0 reproduces
the pipeline positions to better than 0.5 arcsec (< 0.1 SPHEREx pixel).
"""

import json
from pathlib import Path

from .models import Target

PIPELINE_TARGETS = Path(__file__).resolve().parents[2] / "pipeline" / "targets.json"

# key -> fields the pipeline file does not carry
CATALOG = {
    "barnard": dict(
        simbad_id="NAME Barnard's star", ra_j2000=269.452077, dec_j2000=4.693365,
        pmra=-801.551, pmdec=10362.394, parallax=546.976,
        aliases=["barnard", "barnards star", "barnard star", "gj 699", "gl 699", "v2500 oph"],
        detector=6, mode="epoch",
        hint="A nearby star that visibly shifts north between visits."),
    "epsindb": dict(
        simbad_id="* eps Ind B", ra_j2000=331.044147, dec_j2000=-56.782844,
        pmra=3981.977, pmdec=-2466.832, parallax=270.658,
        aliases=["eps ind b", "epsilon indi b", "epsilon ind b", "eps indi b", "eps ind ba", "eps ind bb"],
        detector=6, mode="epoch",
        hint="A pair of brown dwarfs moving together across the sky."),
    "wise0855": dict(
        simbad_id="WISEA J085510.74-071442.5", ra_j2000=133.818908, dec_j2000=-7.247048,
        pmra=-8123.7, pmdec=673.2, parallax=439.0,
        aliases=["wise 0855", "wise 0855-0714", "wise 0855-07", "wise j0855-0714",
                 "wise j085510.83-071442.5", "wisea j085510.74-071442.5"],
        detector=6, mode="shift_add",
        hint="Too faint for a single image. Shift & add reveals it."),
    "rwaur": dict(
        simbad_id="V* RW Aur", ra_j2000=76.956526, dec_j2000=30.401438,
        pmra=7.23, pmdec=-20.33, parallax=15.42,
        aliases=["rw aur", "rw aurigae"],
        detector=6, mode="epoch",
        hint="A young star whose brightness changes."),
    "rdra": dict(
        simbad_id="V* R Dra", ra_j2000=248.167611, dec_j2000=66.754979,
        pmra=-20.643, pmdec=6.149, parallax=1.2509,
        aliases=["r dra", "r draconis"],
        detector=6, mode="epoch",
        hint="A pulsating giant star, observed hundreds of times."),
}

# Used only if pipeline/targets.json is missing (copy of its values).
_FALLBACK_POSITIONS = {
    "barnard": ("Barnard's Star", 269.446271, 4.768197),
    "epsindb": ("Epsilon Indi B", 331.096658, -56.800657),
    "wise0855": ("WISE 0855-0714", 133.759871, -7.242252),
    "rwaur": ("RW Aurigae", 76.956590, 30.401293),
    "rdra": ("R Draconis", 248.167233, 66.755024),
}

_TARGET_FIELDS = ("pmra", "pmdec", "detector", "mode", "hint")


def _load_positions() -> dict:
    try:
        data = json.loads(PIPELINE_TARGETS.read_text(encoding="utf-8"))["targets"]
        return {key: (t["name"], t["ra"], t["dec"]) for key, t in data.items()}
    except (OSError, KeyError, ValueError):
        return _FALLBACK_POSITIONS


def load_targets() -> list:
    positions = _load_positions()
    return [
        Target(key=key, name=name, ra=ra, dec=dec,
               **{field: CATALOG[key][field] for field in _TARGET_FIELDS})
        for key, (name, ra, dec) in positions.items()
        if key in CATALOG
    ]


TARGETS = load_targets()
TARGETS_BY_KEY = {t.key: t for t in TARGETS}
