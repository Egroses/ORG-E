"""Sky Quest imaging: frame stacks, patches for the game, and their encoders.

AI-assisted code (Claude Code).
"""

from .frames import make_frames
from .patch import encode_patch, make_patch

__all__ = ["make_frames", "make_patch", "encode_patch"]
