"""Resolve CHIPPI_HOME for standalone skill scripts.

Skill scripts may run outside the Chippi process (e.g. system Python,
nix env, CI) where ``chippi_constants`` is not importable.  This module
provides the same ``get_chippi_home()`` and ``display_chippi_home()``
contracts as ``chippi_constants`` without requiring it on ``sys.path``.

When ``chippi_constants`` IS available it is used directly so that any
future enhancements (profile resolution, Docker detection, etc.) are
picked up automatically.  The fallback path replicates the core logic
from ``chippi_constants.py`` using only the stdlib.

All scripts under ``google-workspace/scripts/`` should import from here
instead of duplicating the ``CHIPPI_HOME = Path(os.getenv(...))`` pattern.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from chippi_constants import display_chippi_home as display_chippi_home
    from chippi_constants import get_chippi_home as get_chippi_home
except (ModuleNotFoundError, ImportError):

    def get_chippi_home() -> Path:
        """Return the Chippi home directory (default: ~/.chippi).

        Mirrors ``chippi_constants.get_chippi_home()``."""
        val = os.environ.get("CHIPPI_HOME", "").strip()
        return Path(val) if val else Path.home() / ".chippi"

    def display_chippi_home() -> str:
        """Return a user-friendly ``~/``-shortened display string.

        Mirrors ``chippi_constants.display_chippi_home()``."""
        home = get_chippi_home()
        try:
            return "~/" + str(home.relative_to(Path.home()))
        except ValueError:
            return str(home)
