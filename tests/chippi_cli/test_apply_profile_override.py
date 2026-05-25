"""Regression tests for _apply_profile_override CHIPPI_HOME guard (issue #22502).

When CHIPPI_HOME is set to the chippi root (e.g. systemd hardcodes
CHIPPI_HOME=/root/.chippi), _apply_profile_override must still read
active_profile and update CHIPPI_HOME to the profile directory.

When CHIPPI_HOME is already a profile directory (.../profiles/<name>),
_apply_profile_override must trust it and return without re-reading
active_profile (child-process inheritance contract).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest


def _run_apply_profile_override(
    tmp_path, monkeypatch, *, chippi_home: str | None, active_profile: str | None,
    argv: list[str] | None = None,
):
    """Run _apply_profile_override in isolation.

    Returns the value of os.environ["CHIPPI_HOME"] after the call,
    or None if unset.
    """
    chippi_root = tmp_path / ".chippi"
    chippi_root.mkdir(parents=True, exist_ok=True)

    if active_profile is not None:
        (chippi_root / "active_profile").write_text(active_profile)

    if active_profile and active_profile != "default":
        (chippi_root / "profiles" / active_profile).mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    if chippi_home is not None:
        monkeypatch.setenv("CHIPPI_HOME", chippi_home)
    else:
        monkeypatch.delenv("CHIPPI_HOME", raising=False)

    monkeypatch.setattr(sys, "argv", argv or ["chippi", "gateway", "start"])

    from chippi_cli.main import _apply_profile_override
    _apply_profile_override()

    return os.environ.get("CHIPPI_HOME")


class TestApplyProfileOverrideChippiHomeGuard:
    """Regression guard for issue #22502.

    Verifies that CHIPPI_HOME pointing to the chippi root does NOT suppress
    the active_profile check, while CHIPPI_HOME already pointing to a
    profile directory IS trusted as-is.
    """

    def test_chippi_home_at_root_with_active_profile_is_redirected(
        self, tmp_path, monkeypatch
    ):
        """CHIPPI_HOME=/root/.chippi + active_profile=coder must redirect
        CHIPPI_HOME to .../profiles/coder.

        Bug scenario from #22502: systemd sets CHIPPI_HOME to the chippi root
        and the user switches to a profile via `chippi profile use`.
        Before the fix, the guard returned early and active_profile was ignored.
        """
        chippi_root = tmp_path / ".chippi"
        chippi_root.mkdir(parents=True, exist_ok=True)

        result = _run_apply_profile_override(
            tmp_path,
            monkeypatch,
            chippi_home=str(chippi_root),
            active_profile="coder",
        )

        assert result is not None, "CHIPPI_HOME must be set after profile redirect"
        assert "profiles" in result, (
            f"Expected CHIPPI_HOME to point into profiles/ dir, got: {result!r}"
        )
        assert result.endswith("coder"), (
            f"Expected CHIPPI_HOME to end with 'coder', got: {result!r}"
        )

    def test_chippi_home_already_profile_dir_is_trusted(self, tmp_path, monkeypatch):
        """CHIPPI_HOME=.../profiles/coder must not be overridden even when
        active_profile says something different.

        Preserves the child-process inheritance contract: a subprocess spawned
        with CHIPPI_HOME already set to a specific profile must stay in that
        profile.
        """
        chippi_root = tmp_path / ".chippi"
        profile_dir = chippi_root / "profiles" / "coder"
        profile_dir.mkdir(parents=True, exist_ok=True)

        (chippi_root / "active_profile").write_text("other")

        monkeypatch.setattr(Path, "home", lambda: tmp_path)
        monkeypatch.setenv("CHIPPI_HOME", str(profile_dir))
        monkeypatch.setattr(sys, "argv", ["chippi", "gateway", "start"])

        from chippi_cli.main import _apply_profile_override
        _apply_profile_override()

        assert os.environ.get("CHIPPI_HOME") == str(profile_dir), (
            "CHIPPI_HOME must remain unchanged when already pointing to a profile dir"
        )

    def test_chippi_home_unset_reads_active_profile(self, tmp_path, monkeypatch):
        """Classic case: CHIPPI_HOME unset + active_profile=coder must set
        CHIPPI_HOME to the profile directory (existing behaviour must not regress).
        """
        result = _run_apply_profile_override(
            tmp_path,
            monkeypatch,
            chippi_home=None,
            active_profile="coder",
        )

        assert result is not None
        assert "coder" in result

    def test_chippi_home_unset_default_profile_no_redirect(self, tmp_path, monkeypatch):
        """active_profile=default must not redirect CHIPPI_HOME."""
        chippi_root = tmp_path / ".chippi"
        chippi_root.mkdir(parents=True, exist_ok=True)

        monkeypatch.setattr(Path, "home", lambda: tmp_path)
        monkeypatch.delenv("CHIPPI_HOME", raising=False)
        monkeypatch.setattr(sys, "argv", ["chippi", "gateway", "start"])
        (chippi_root / "active_profile").write_text("default")

        from chippi_cli.main import _apply_profile_override
        _apply_profile_override()

        assert os.environ.get("CHIPPI_HOME") is None
