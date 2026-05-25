#!/bin/sh
# s6-overlay stage2 hook — runs as root after the supervision tree is
# up but before user services start. Handles UID/GID remap, volume
# chown, config seeding, and skills sync.
#
# Per-service privilege drop happens inside each service's `run` script
# (and in main-wrapper.sh) via s6-setuidgid, not here.
#
# Wired into the image as /etc/cont-init.d/01-chippi-setup by the
# Dockerfile. The shim at docker/entrypoint.sh forwards to this script
# so external references to docker/entrypoint.sh still work.
#
# NB: cont-init.d scripts run with no arguments — the user's CMD args
# are NOT visible here. That's fine: we use Architecture B (s6-overlay
# main-program model), so main-wrapper.sh runs the CMD with full
# stdin/stdout/stderr access and handles arg parsing there.

set -eu

CHIPPI_HOME="${CHIPPI_HOME:-/opt/data}"
INSTALL_DIR="/opt/chippi"

# --- UID/GID remap ---
if [ -n "${CHIPPI_UID:-}" ] && [ "$CHIPPI_UID" != "$(id -u chippi)" ]; then
    echo "[stage2] Changing chippi UID to $CHIPPI_UID"
    usermod -u "$CHIPPI_UID" chippi
fi
if [ -n "${CHIPPI_GID:-}" ] && [ "$CHIPPI_GID" != "$(id -g chippi)" ]; then
    echo "[stage2] Changing chippi GID to $CHIPPI_GID"
    # -o allows non-unique GID (e.g. macOS GID 20 "staff" may already
    # exist as "dialout" in the Debian-based container image).
    groupmod -o -g "$CHIPPI_GID" chippi 2>/dev/null || true
fi

# --- Fix ownership of data volume ---
actual_chippi_uid=$(id -u chippi)
needs_chown=false
if [ -n "${CHIPPI_UID:-}" ] && [ "$CHIPPI_UID" != "10000" ]; then
    needs_chown=true
elif [ "$(stat -c %u "$CHIPPI_HOME" 2>/dev/null)" != "$actual_chippi_uid" ]; then
    needs_chown=true
fi
if [ "$needs_chown" = true ]; then
    echo "[stage2] Fixing ownership of $CHIPPI_HOME to chippi ($actual_chippi_uid)"
    # In rootless Podman the container's "root" is mapped to an
    # unprivileged host UID — chown will fail. That's fine: the volume
    # is already owned by the mapped user on the host side.
    chown -R chippi:chippi "$CHIPPI_HOME" 2>/dev/null || \
        echo "[stage2] Warning: chown failed (rootless container?) — continuing"
    # The .venv must also be re-chowned when UID is remapped, otherwise
    # lazy_deps.py cannot install platform packages (discord.py, etc.).
    chown -R chippi:chippi "$INSTALL_DIR/.venv" 2>/dev/null || \
        echo "[stage2] Warning: chown .venv failed (rootless container?) — continuing"
fi

# Always reset ownership of $CHIPPI_HOME/profiles to chippi on every
# boot. Profile dirs and files can land owned by root when commands
# are invoked via `docker exec <container> chippi …` (which defaults
# to root unless `-u` is passed), and that breaks the cont-init
# reconciler (02-reconcile-profiles) which runs as chippi and walks
# the profiles dir. Idempotent; skipped on rootless containers where
# chown would fail.
if [ -d "$CHIPPI_HOME/profiles" ]; then
    chown -R chippi:chippi "$CHIPPI_HOME/profiles" 2>/dev/null || true
fi

# --- config.yaml permissions ---
# Ensure config.yaml is readable by the chippi runtime user even if it
# was edited on the host after initial ownership setup.
if [ -f "$CHIPPI_HOME/config.yaml" ]; then
    chown chippi:chippi "$CHIPPI_HOME/config.yaml" 2>/dev/null || true
    chmod 640 "$CHIPPI_HOME/config.yaml" 2>/dev/null || true
fi

# --- Seed directory structure as chippi user ---
# Run as chippi via s6-setuidgid so dirs end up owned correctly (matters
# under rootless Podman where chown back to root would fail).
#
# Use direct `mkdir -p` invocation (no `sh -c "..."` wrapper) so the
# shell isn't a second interpreter — defends against $CHIPPI_HOME values
# containing shell metacharacters. PR #30136 review item O2.
s6-setuidgid chippi mkdir -p \
    "$CHIPPI_HOME/cron" \
    "$CHIPPI_HOME/sessions" \
    "$CHIPPI_HOME/logs" \
    "$CHIPPI_HOME/hooks" \
    "$CHIPPI_HOME/memories" \
    "$CHIPPI_HOME/skills" \
    "$CHIPPI_HOME/skins" \
    "$CHIPPI_HOME/plans" \
    "$CHIPPI_HOME/workspace" \
    "$CHIPPI_HOME/home"

# --- Install-method stamp (read by detect_install_method() in chippi status) ---
# Preserved from the tini-era entrypoint (PR #27843). Must be written as
# the chippi user so ownership matches the file's documented owner.
# tee is invoked directly via s6-setuidgid (no `sh -c` wrapper) for the
# same shell-metacharacter safety described above.
printf 'docker\n' | s6-setuidgid chippi tee "$CHIPPI_HOME/.install_method" >/dev/null \
    || true

# --- Seed config files (only on first boot) ---
seed_one() {
    dest=$1
    src=$2
    if [ ! -f "$CHIPPI_HOME/$dest" ] && [ -f "$INSTALL_DIR/$src" ]; then
        s6-setuidgid chippi cp "$INSTALL_DIR/$src" "$CHIPPI_HOME/$dest"
    fi
}
seed_one ".env" ".env.example"
seed_one "config.yaml" "cli-config.yaml.example"
seed_one "SOUL.md" "docker/SOUL.md"

# .env holds API keys and secrets — restrict to owner-only access. Applied
# unconditionally (not only on first-seed) so a host-mounted .env that was
# created with a permissive umask gets tightened on every container start.
if [ -f "$CHIPPI_HOME/.env" ]; then
    chown chippi:chippi "$CHIPPI_HOME/.env" 2>/dev/null || true
    chmod 600 "$CHIPPI_HOME/.env" 2>/dev/null || true
fi

# auth.json: bootstrap from env on first boot only. Same semantics as the
# pre-s6 entrypoint — the [ ! -f ] guard is critical to avoid clobbering
# rotated refresh tokens on container restart.
if [ ! -f "$CHIPPI_HOME/auth.json" ] && [ -n "${CHIPPI_AUTH_JSON_BOOTSTRAP:-}" ]; then
    printf '%s' "$CHIPPI_AUTH_JSON_BOOTSTRAP" > "$CHIPPI_HOME/auth.json"
    chown chippi:chippi "$CHIPPI_HOME/auth.json" 2>/dev/null || true
    chmod 600 "$CHIPPI_HOME/auth.json"
fi

# --- Sync bundled skills ---
# Invoke the venv's python by absolute path so we don't need a `sh -c`
# wrapper to source the activate script. This is safe because
# skills_sync.py doesn't depend on any environment exports beyond what
# the python binary's own bin-stub already sets up (sys.path is rooted
# at the venv's site-packages by virtue of running .venv/bin/python).
if [ -d "$INSTALL_DIR/skills" ]; then
    s6-setuidgid chippi "$INSTALL_DIR/.venv/bin/python" "$INSTALL_DIR/tools/skills_sync.py" \
        || echo "[stage2] Warning: skills_sync.py failed; continuing"
fi

echo "[stage2] Setup complete; starting user services"
