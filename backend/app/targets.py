"""The five challenge test targets.

Positions come from pipeline/targets.json (epoch 2026.0) so cache keys match the pipeline.
Proper motions are approximate catalog values (mas/yr) and should be checked against SIMBAD.
"""

import json
from pathlib import Path

from .models import Target

PIPELINE_TARGETS = Path(__file__).resolve().parents[2] / "pipeline" / "targets.json"

# key -> extra fields the pipeline file does not carry
_EXTRA = {
    "barnard": dict(pmra=-801.551, pmdec=10362.394, detector=6, mode="epoch",
                    hint="A nearby star that visibly shifts north between visits."),
    "epsindb": dict(pmra=3966.661, pmdec=-2536.192, detector=6, mode="epoch",
                    hint="A pair of brown dwarfs moving together across the sky."),
    "wise0855": dict(pmra=-8123.7, pmdec=673.0, detector=6, mode="shift_add",
                     hint="Too faint for a single image. Shift & add reveals it."),
    "rwaur": dict(pmra=None, pmdec=None, detector=6, mode="epoch",
                  hint="A young star whose brightness changes."),
    "rdra": dict(pmra=None, pmdec=None, detector=6, mode="epoch",
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


def _load_positions() -> dict:
    try:
        data = json.loads(PIPELINE_TARGETS.read_text(encoding="utf-8"))["targets"]
        return {key: (t["name"], t["ra"], t["dec"]) for key, t in data.items()}
    except (OSError, KeyError, ValueError):
        return _FALLBACK_POSITIONS


def load_targets() -> list:
    positions = _load_positions()
    return [
        Target(key=key, name=name, ra=ra, dec=dec, **_EXTRA[key])
        for key, (name, ra, dec) in positions.items()
        if key in _EXTRA
    ]


TARGETS = load_targets()
