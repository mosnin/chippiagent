"""Tests for _is_write_denied() — verifies deny list blocks sensitive paths on all platforms."""

import os

import pytest
from pathlib import Path
from unittest.mock import patch

from tools.file_operations import _is_write_denied


class TestWriteDenyExactPaths:
    def test_etc_shadow(self):
        assert _is_write_denied("/etc/shadow") is True

    def test_etc_passwd(self):
        assert _is_write_denied("/etc/passwd") is True

    def test_etc_sudoers(self):
        assert _is_write_denied("/etc/sudoers") is True

    def test_ssh_authorized_keys(self):
        assert _is_write_denied("~/.ssh/authorized_keys") is True

    def test_ssh_id_rsa(self):
        path = os.path.join(str(Path.home()), ".ssh", "id_rsa")
        assert _is_write_denied(path) is True

    def test_ssh_id_ed25519(self):
        path = os.path.join(str(Path.home()), ".ssh", "id_ed25519")
        assert _is_write_denied(path) is True

    def test_netrc(self):
        path = os.path.join(str(Path.home()), ".netrc")
        assert _is_write_denied(path) is True

    def test_chippi_env(self):
        # ``.env`` under the active CHIPPI_HOME (profile-aware, not just
        # ``~/.chippi``) must be write-denied. The hermetic test conftest
        # points CHIPPI_HOME at a tempdir — resolve via get_chippi_home()
        # to match the denylist.
        from chippi_constants import get_chippi_home
        path = str(get_chippi_home() / ".env")
        assert _is_write_denied(path) is True

    def test_chippi_root_env_when_running_under_profile(self, tmp_path, monkeypatch):
        """Top-level ``<root>/.env`` stays write-denied even when running under
        a profile (#15981).

        Before the fix, ``build_write_denied_paths`` only added
        ``<active_profile>/.env`` to the deny list, so the global
        ``~/.chippi/.env`` (whose credentials are inherited by every profile)
        could be silently overwritten by ``write_file`` while a profile was
        active.
        """
        root = tmp_path / "chippi_root"
        profile_home = root / "profiles" / "coder"
        profile_home.mkdir(parents=True)
        global_env = root / ".env"
        global_env.write_text("OPENAI_API_KEY=sk-real\n")

        monkeypatch.setenv("CHIPPI_HOME", str(profile_home))

        # Sanity check: CHIPPI_HOME does point to the profile dir, not the root.
        from chippi_constants import get_chippi_home, get_default_chippi_root
        assert get_chippi_home() == profile_home
        assert get_default_chippi_root() == root

        assert _is_write_denied(str(global_env)) is True

    def test_shell_profiles(self):
        home = str(Path.home())
        for name in [".bashrc", ".zshrc", ".profile", ".bash_profile", ".zprofile"]:
            assert _is_write_denied(os.path.join(home, name)) is True, f"{name} should be denied"

    def test_package_manager_configs(self):
        home = str(Path.home())
        for name in [".npmrc", ".pypirc", ".pgpass"]:
            assert _is_write_denied(os.path.join(home, name)) is True, f"{name} should be denied"


class TestWriteDenyPrefixes:
    def test_ssh_prefix(self):
        path = os.path.join(str(Path.home()), ".ssh", "some_key")
        assert _is_write_denied(path) is True

    def test_aws_prefix(self):
        path = os.path.join(str(Path.home()), ".aws", "credentials")
        assert _is_write_denied(path) is True

    def test_gnupg_prefix(self):
        path = os.path.join(str(Path.home()), ".gnupg", "secring.gpg")
        assert _is_write_denied(path) is True

    def test_kube_prefix(self):
        path = os.path.join(str(Path.home()), ".kube", "config")
        assert _is_write_denied(path) is True

    def test_sudoers_d_prefix(self):
        assert _is_write_denied("/etc/sudoers.d/custom") is True

    def test_systemd_prefix(self, tmp_path):
        # On NixOS, /etc/systemd is a symlink into /nix/store, so
        # realpath() resolves it to a store path that doesn't match
        # the /etc/systemd/ prefix.  Build a real directory tree so
        # realpath is a no-op and prefix matching works.
        fake_etc = tmp_path / "etc" / "systemd" / "system"
        fake_etc.mkdir(parents=True)
        target = str(fake_etc / "evil.service")
        # Patch the prefix builder to include our tmp_path prefix
        import agent.file_safety as _fs
        _orig = _fs.build_write_denied_prefixes
        _extra_prefix = str(tmp_path / "etc" / "systemd") + os.sep
        def _patched(home):
            return _orig(home) + [_extra_prefix]
        with patch.object(_fs, "build_write_denied_prefixes", _patched):
            assert _is_write_denied(target) is True


class TestWriteAllowed:
    def test_tmp_file(self):
        assert _is_write_denied("/tmp/safe_file.txt") is False

    def test_project_file(self):
        assert _is_write_denied("/home/user/project/main.py") is False

    def test_chippi_config_not_env(self):
        path = os.path.join(str(Path.home()), ".chippi", "config.yaml")
        assert _is_write_denied(path) is False
