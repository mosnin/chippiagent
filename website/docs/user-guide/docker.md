---
sidebar_position: 7
title: "Docker"
description: "Running Chippi Agent in Docker and using Docker as a terminal backend"
---

# Chippi Agent — Docker

There are two distinct ways Docker intersects with Chippi Agent:

1. **Running Chippi IN Docker** — the agent itself runs inside a container (this page's primary focus)
2. **Docker as a terminal backend** — the agent runs on your host but executes every command inside a single, persistent Docker sandbox container that survives across tool calls, `/new`, and subagents for the life of the Chippi process (see [Configuration → Docker Backend](./configuration.md#docker-backend))

This page covers option 1. The container stores all user data (config, API keys, sessions, skills, memories) in a single directory mounted from the host at `/opt/data`. The image itself is stateless and can be upgraded by pulling a new version without losing any configuration.

## Quick start

If this is your first time running Chippi Agent, create a data directory on the host and start the container interactively to run the setup wizard:

```sh
mkdir -p ~/.chippi
docker run -it --rm \
  -v ~/.chippi:/opt/data \
  nousresearch/chippi-agent setup
```

This drops you into the setup wizard, which will prompt you for your API keys and write them to `~/.chippi/.env`. You only need to do this once. It is highly recommended to set up a chat system for the gateway to work with at this point.

## Running in gateway mode

Once configured, run the container in the background as a persistent gateway (Telegram, Discord, Slack, WhatsApp, etc.):

```sh
docker run -d \
  --name chippi \
  --restart unless-stopped \
  -v ~/.chippi:/opt/data \
  -p 8642:8642 \
  nousresearch/chippi-agent gateway run
```

Port 8642 exposes the gateway's [OpenAI-compatible API server](./features/api-server.md) and health endpoint. It's optional if you only use chat platforms (Telegram, Discord, etc.), but required if you want the dashboard or external tools to reach the gateway.

Note: the API server is gated on `API_SERVER_ENABLED=true`. To expose it beyond `127.0.0.1` inside the container, also set `API_SERVER_HOST=0.0.0.0` and an `API_SERVER_KEY` (minimum 8 characters — generate one with `openssl rand -hex 32`). Example:

```sh
docker run -d \
  --name chippi \
  --restart unless-stopped \
  -v ~/.chippi:/opt/data \
  -p 8642:8642 \
  -e API_SERVER_ENABLED=true \
  -e API_SERVER_HOST=0.0.0.0 \
  -e API_SERVER_KEY="$(openssl rand -hex 32)" \
  -e API_SERVER_CORS_ORIGINS='*' \
  nousresearch/chippi-agent gateway run
```

Opening any port on an internet facing machine is a security risk. You should not do it unless you understand the risks.

## Running the dashboard

The built-in web dashboard runs as an optional side-process inside the same container as the gateway. Set `CHIPPI_DASHBOARD=1` to run the dashboard on container loopback (`127.0.0.1`) by default:

```sh
docker run -d \
  --name chippi \
  --restart unless-stopped \
  -v ~/.chippi:/opt/data \
  -p 8642:8642 \
  -e CHIPPI_DASHBOARD=1 \
  nousresearch/chippi-agent gateway run
```

The entrypoint starts `chippi dashboard` in the background (running as the non-root `chippi` user) before `exec`-ing the main command. Dashboard output is prefixed with `[dashboard]` in `docker logs` so it's easy to separate from gateway logs.

| Environment variable | Description | Default |
|---------------------|-------------|---------|
| `CHIPPI_DASHBOARD` | Set to `1` (or `true` / `yes`) to launch the dashboard alongside the main command | *(unset — dashboard not started)* |
| `CHIPPI_DASHBOARD_HOST` | Bind address for the dashboard HTTP server | `127.0.0.1` |
| `CHIPPI_DASHBOARD_PORT` | Port for the dashboard HTTP server | `9119` |
| `CHIPPI_DASHBOARD_TUI` | Set to `1` to expose the in-browser Chat tab (embedded `chippi --tui` via PTY/WebSocket) | *(unset)* |

By default, the dashboard stays on loopback to avoid exposing the unauthenticated web surface over the network. To publish it intentionally, set `CHIPPI_DASHBOARD_HOST=0.0.0.0` and configure your own trusted network boundary/reverse proxy. In that case you must explicitly add `--insecure` behavior by passing host/flags in your command path (the entrypoint no longer auto-enables insecure mode).

:::note
The dashboard runs as a supervised s6 service inside the container. If
the dashboard process crashes, s6-overlay restarts it automatically
after a short backoff — you'll see a new PID without needing to
restart the container. Logs and crash output are visible via
`docker logs <container>` (s6 forwards service stdout/stderr there).

Running the dashboard as a separate container is not supported: its
gateway-liveness detection requires a shared PID namespace with the
gateway process.
:::

## Running interactively (CLI chat)

To open an interactive chat session against a running data directory:

```sh
docker run -it --rm \
  -v ~/.chippi:/opt/data \
  nousresearch/chippi-agent
```

Or if you have already opened a terminal in your running container (via Docker Desktop for instance), just run:

```sh
/opt/chippi/.venv/bin/chippi
```

## Persistent volumes

The `/opt/data` volume is the single source of truth for all Chippi state. It maps to your host's `~/.chippi/` directory and contains:

| Path | Contents |
|------|----------|
| `.env` | API keys and secrets |
| `config.yaml` | All Chippi configuration |
| `SOUL.md` | Agent personality/identity |
| `sessions/` | Conversation history |
| `memories/` | Persistent memory store |
| `skills/` | Installed skills |
| `cron/` | Scheduled job definitions |
| `hooks/` | Event hooks |
| `logs/` | Runtime logs |
| `skins/` | Custom CLI skins |

:::warning
Never run two Chippi **gateway** containers against the same data directory simultaneously — session files and memory stores are not designed for concurrent write access.
:::

## Multi-profile support

Chippi supports [multiple profiles](../reference/profile-commands.md) — separate `~/.chippi/` directories that let you run independent agents (different SOUL, skills, memory, sessions, credentials) from a single installation. **When running under Docker, using Chippi' built-in multi-profile feature is not recommended.**

Instead, the recommended pattern is **one container per profile**, with each container bind-mounting its own host directory as `/opt/data`:

```sh
# Work profile
docker run -d \
  --name chippi-work \
  --restart unless-stopped \
  -v ~/.chippi-work:/opt/data \
  -p 8642:8642 \
  nousresearch/chippi-agent gateway run

# Personal profile
docker run -d \
  --name chippi-personal \
  --restart unless-stopped \
  -v ~/.chippi-personal:/opt/data \
  -p 8643:8642 \
  nousresearch/chippi-agent gateway run
```

Why separate containers over profiles in Docker:

- **Isolation** — each container has its own filesystem, process table, and resource limits. A crash, dependency change, or runaway session in one profile can't affect another.
- **Independent lifecycle** — upgrade, restart, pause, or roll back each agent separately (`docker restart chippi-work` leaves `chippi-personal` untouched).
- **Clean port and network separation** — each gateway binds its own host port; there's no risk of cross-talk between chat platforms or API servers.
- **Simpler mental model** — the container *is* the profile. Backups, migrations, and permissions all follow the bind-mounted directory, with no extra `--profile` flags to remember.
- **Avoids concurrent-write risk** — the warning above about never running two gateways against the same data directory still applies to profiles within a single container.

In Docker Compose, this just means declaring one service per profile with distinct `container_name`, `volumes`, and `ports`:

```yaml
services:
  chippi-work:
    image: nousresearch/chippi-agent:latest
    container_name: chippi-work
    restart: unless-stopped
    command: gateway run
    ports:
      - "8642:8642"
    volumes:
      - ~/.chippi-work:/opt/data

  chippi-personal:
    image: nousresearch/chippi-agent:latest
    container_name: chippi-personal
    restart: unless-stopped
    command: gateway run
    ports:
      - "8643:8642"
    volumes:
      - ~/.chippi-personal:/opt/data
```

## Environment variable forwarding

API keys are read from `/opt/data/.env` inside the container. You can also pass environment variables directly:

```sh
docker run -it --rm \
  -v ~/.chippi:/opt/data \
  -e ANTHROPIC_API_KEY="sk-ant-..." \
  -e OPENAI_API_KEY="sk-..." \
  nousresearch/chippi-agent
```

Direct `-e` flags override values from `.env`. This is useful for CI/CD or secrets-manager integrations where you don't want keys on disk.

:::note Looking for Docker as the **terminal backend**?
This page covers running Chippi itself inside Docker. If you want Chippi to execute the agent's `terminal` / `execute_code` calls inside a Docker sandbox container (one persistent container per Chippi process), that's a separate config block — `terminal.backend: docker` plus `terminal.docker_image`, `terminal.docker_volumes`, `terminal.docker_forward_env`, `terminal.docker_run_as_host_user`, and `terminal.docker_extra_args`. See [Configuration → Docker Backend](configuration.md#docker-backend) for the full set.
:::

## Docker Compose example

For persistent deployment with both the gateway and dashboard, a `docker-compose.yaml` is convenient:

```yaml
services:
  chippi:
    image: nousresearch/chippi-agent:latest
    container_name: chippi
    restart: unless-stopped
    command: gateway run
    ports:
      - "8642:8642"   # gateway API
      - "9119:9119"   # dashboard (only reached when CHIPPI_DASHBOARD=1)
    volumes:
      - ~/.chippi:/opt/data
    environment:
      - CHIPPI_DASHBOARD=1
      # Uncomment to forward specific env vars instead of using .env file:
      # - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      # - OPENAI_API_KEY=${OPENAI_API_KEY}
      # - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: "2.0"
```

Start with `docker compose up -d` and view logs with `docker compose logs -f`. Dashboard output is prefixed with `[dashboard]` so it's easy to filter from gateway logs.

## Resource limits

The Chippi container needs moderate resources. Recommended minimums:

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| Memory | 1 GB | 2–4 GB |
| CPU | 1 core | 2 cores |
| Disk (data volume) | 500 MB | 2+ GB (grows with sessions/skills) |

Browser automation (Playwright/Chromium) is the most memory-hungry feature. If you don't need browser tools, 1 GB is sufficient. With browser tools active, allocate at least 2 GB.

Set limits in Docker:

```sh
docker run -d \
  --name chippi \
  --restart unless-stopped \
  --memory=4g --cpus=2 \
  -v ~/.chippi:/opt/data \
  nousresearch/chippi-agent gateway run
```

## What the Dockerfile does

The official image is based on `debian:13.4` and includes:

- Python 3 with all Chippi dependencies (`uv pip install -e ".[all]"`)
- Node.js + npm (for browser automation and WhatsApp bridge)
- Playwright with Chromium (`npx playwright install --with-deps chromium --only-shell`)
- ripgrep, ffmpeg, git, and `xz-utils` as system utilities
- **`docker-cli`** — so agents running inside the container can drive the host's Docker daemon (bind-mount `/var/run/docker.sock` to opt in) for `docker build`, `docker run`, container inspection, etc.
- **`openssh-client`** — enables the [SSH terminal backend](/user-guide/configuration#ssh-backend) from inside the container. The SSH backend shells out to the system `ssh` binary; without this, it failed silently in containerized installs.
- The WhatsApp bridge (`scripts/whatsapp-bridge/`)
- **[`s6-overlay`](https://github.com/just-containers/s6-overlay) v3** as PID 1 (replaces the older `tini`) — supervises the dashboard and per-profile gateways with auto-restart on crash, reaps zombie subprocesses, and forwards signals.

The container's `ENTRYPOINT` is s6-overlay's `/init`. On boot it:
1. Runs `/etc/cont-init.d/01-chippi-setup` (= `docker/stage2-hook.sh`) as root: optional UID/GID remap, fixes volume ownership, seeds `.env` / `config.yaml` / `SOUL.md` on first boot, syncs bundled skills.
2. Runs `/etc/cont-init.d/02-reconcile-profiles` (= `chippi_cli.container_boot`): walks `$CHIPPI_HOME/profiles/<name>/`, recreates the per-profile gateway s6 service slot under `/run/service/gateway-<profile>/`, and auto-starts only those whose last recorded state was `running` (see [Per-profile gateway supervision](#per-profile-gateway-supervision)).
3. Starts the static `main-chippi` and `dashboard` s6-rc services.
4. Exec's the container's CMD as the main program (`/opt/chippi/docker/main-wrapper.sh`), which routes the arguments the user passed to `docker run`:
   - no args → `chippi` (the default)
   - first arg is an executable on PATH (e.g. `sleep`, `bash`) → exec it directly
   - anything else → `chippi <args>` (subcommand passthrough)
   The container exits when this main program exits, with its exit code.

:::warning Breaking change vs. pre-s6 images
The container ENTRYPOINT is now `/init` (s6-overlay), not `/usr/bin/tini`. All five documented `docker run` invocation patterns (no args, `chat -q "…"`, `sleep infinity`, `bash`, `--tui`) behave identically to the tini-based image. If you have a downstream wrapper that depended on tini-specific signal behavior or hard-coded `/usr/bin/tini --` invocation, pin to the previous image tag.
:::

:::warning Privilege model
Do not override the image entrypoint unless you keep `/init` (or, equivalently, the legacy `docker/entrypoint.sh` shim that forwards to the stage2 hook) in the command chain. s6-overlay's `/init` runs as root so it can chown the volume on first boot, then drops to the `chippi` user via `s6-setuidgid` for every supervised service AND for the main program. Starting `chippi gateway run` as root inside the official image is refused by default because it can leave root-owned files in `/opt/data` and break later dashboard or gateway starts. Set `CHIPPI_ALLOW_ROOT_GATEWAY=1` only when you intentionally accept that risk.
:::

### Per-profile gateway supervision

Inside the container, each profile created with `chippi profile create <name>` automatically gets an s6-supervised gateway service registered at `/run/service/gateway-<name>/`. The lifecycle commands you'd run on the host work the same way:

```sh
chippi profile create coder            # registers gateway-coder s6 slot
chippi -p coder gateway start          # s6-svc -u  → supervised gateway
chippi -p coder gateway stop           # s6-svc -d  → service down
chippi -p coder gateway restart        # s6-svc -t  → SIGTERM the supervisor
chippi profile delete coder            # tears down the s6 slot
```

**Supervision benefits over the pre-s6 image:**

- Gateway crashes are auto-restarted by `s6-supervise` after a ~1s backoff.
- Dashboard crashes are auto-restarted (set `CHIPPI_DASHBOARD=1` to start it).
- `docker restart` preserves running gateways: the cont-init reconciler reads `$CHIPPI_HOME/profiles/<name>/gateway_state.json` and brings the slot back up if the last recorded state was `running`. Stopped gateways stay stopped.
- Per-profile gateway logs persist under `$CHIPPI_HOME/logs/gateways/<profile>/current` (rotated by `s6-log`), and the reconciler's actions are appended to `$CHIPPI_HOME/logs/container-boot.log` per boot.

`chippi status` inside the container reports `Manager: s6 (container supervisor)`. Use `/command/s6-svstat /run/service/gateway-<name>` for the raw supervisor view (note `/command/` is on PATH for supervision-tree processes only; pass the absolute path when calling from `docker exec`).

## Upgrading

Pull the latest image and recreate the container. Your data directory is untouched.

```sh
docker pull nousresearch/chippi-agent:latest
docker rm -f chippi
docker run -d \
  --name chippi \
  --restart unless-stopped \
  -v ~/.chippi:/opt/data \
  nousresearch/chippi-agent gateway run
```

Or with Docker Compose:

```sh
docker compose pull
docker compose up -d
```

## Skills and credential files

When using Docker as the execution environment (not the methods above, but when the agent runs commands inside a Docker sandbox — see [Configuration → Docker Backend](./configuration.md#docker-backend)), Chippi reuses a single long-lived container for all tool calls and automatically bind-mounts the skills directory (`~/.chippi/skills/`) and any credential files declared by skills into that container as read-only volumes. Skill scripts, templates, and references are available inside the sandbox without manual configuration, and because the container persists for the life of the Chippi process, any dependencies you install or files you write stay around for the next tool call.

The same syncing happens for SSH and Modal backends — skills and credential files are uploaded via rsync or the Modal mount API before each command.

## Installing more tools in the container

The official image ships with a curated set of utilities (see [What the Dockerfile does](#what-the-dockerfile-does)), but not every tool an agent might want is preinstalled. There are five recommended approaches, in increasing order of effort and durability.

### npm or Python tools — use `npx` or `uvx`

For any tool published to npm or PyPI, instruct Chippi to run it via `npx` (npm) or `uvx` (Python) and to remember that command in its persistent memory. If the tool needs a config file or credentials, instruct it to drop those under `/opt/data` (e.g. `/opt/data/<tool>/config.yaml`).

Dependencies are fetched on demand and cached for the life of the container. Configuration written under `/opt/data` survives container restarts because it lives on the bind-mounted host directory. The package cache itself is rebuilt after a `docker rm`, but `npx` and `uvx` re-fetch transparently the next time the tool runs.

### Other tools (apt packages, binaries) — install and remember

For anything outside npm or PyPI — `apt` packages, prebuilt binaries, language runtimes not already in the image — instruct Chippi how to install it (e.g. `apt-get update && apt-get install -y <package>`) and tell it to remember the install command. The tool persists for the rest of the container's lifetime, and Chippi will re-run the install command after a container restart when it next needs the tool.

This is a good fit for tools that are quick to install and used occasionally. For tools used constantly, prefer the next approach.

### Durable installs — build a derived image

When a tool must be available immediately on every container start with no re-install delay, build a new image that inherits from `nousresearch/chippi-agent` and installs the tool in a layer:

```dockerfile
FROM nousresearch/chippi-agent:latest

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends <your-package> \
    && rm -rf /var/lib/apt/lists/*
USER chippi
```

Build it and use it in place of the official image:

```sh
docker build -t my-chippi:latest .
docker run -d \
  --name chippi \
  --restart unless-stopped \
  -v ~/.chippi:/opt/data \
  -p 8642:8642 \
  my-chippi:latest gateway run
```

The entrypoint script and `/opt/data` semantics are inherited unchanged, so the rest of this page still applies. Remember to rebuild the image when pulling a newer upstream `nousresearch/chippi-agent`.

### Complex tools or multi-service stacks — run a sidecar container

For tools that bring their own service (a database, a web server, a queue, a headless browser farm) or that are too heavy to live inside the Chippi container, run them as a separate container on a shared Docker network. Chippi reaches the sidecar by container name, the same way it reaches a local inference server (see [Connecting to local inference servers](#connecting-to-local-inference-servers-vllm-ollama-etc)).

```yaml
services:
  chippi:
    image: nousresearch/chippi-agent:latest
    container_name: chippi
    restart: unless-stopped
    command: gateway run
    ports:
      - "8642:8642"
    volumes:
      - ~/.chippi:/opt/data
    networks:
      - chippi-net

  my-tool:
    image: example/my-tool:latest
    container_name: my-tool
    restart: unless-stopped
    networks:
      - chippi-net

networks:
  chippi-net:
    driver: bridge
```

From inside the Chippi container, the sidecar is reachable at `http://my-tool:<port>` (or whatever protocol it serves). This pattern keeps each service's lifecycle, resource limits, and upgrade cadence independent, and avoids bloating the Chippi image with dependencies that are only needed by one tool.

### Broadly useful tools — open an issue or pull request

If a tool is likely to be useful to most Chippi Agent users, consider contributing it upstream rather than carrying it in a private derived image. Open an issue or pull request on the [chippi-agent repository](https://github.com/NousResearch/chippi-agent) describing the tool and its use case. Tools that get bundled into the official image benefit every user and avoid the maintenance overhead of a downstream fork.

## Connecting to local inference servers (vLLM, Ollama, etc.)

When running Chippi in Docker and your inference server (vLLM, Ollama, text-generation-inference, etc.) is also running on the host or in another container, networking requires extra attention.

### Docker Compose (recommended)

Put both services on the same Docker network. This is the most reliable approach:

```yaml
services:
  vllm:
    image: vllm/vllm-openai:latest
    container_name: vllm
    command: >
      --model Qwen/Qwen2.5-7B-Instruct
      --served-model-name my-model
      --host 0.0.0.0
      --port 8000
    ports:
      - "8000:8000"
    networks:
      - chippi-net
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]

  chippi:
    image: nousresearch/chippi-agent:latest
    container_name: chippi
    restart: unless-stopped
    command: gateway run
    ports:
      - "8642:8642"
    volumes:
      - ~/.chippi:/opt/data
    networks:
      - chippi-net

networks:
  chippi-net:
    driver: bridge
```

Then in your `~/.chippi/config.yaml`, use the **container name** as the hostname:

```yaml
model:
  provider: custom
  model: my-model
  base_url: http://vllm:8000/v1
  api_key: "none"
```

:::tip Key points
- Use the **container name** (`vllm`) as the hostname — not `localhost` or `127.0.0.1`, which refer to the Chippi container itself.
- The `model` value must match the `--served-model-name` you passed to vLLM.
- Set `api_key` to any non-empty string (vLLM requires the header but doesn't validate it by default).
- Do **not** include a trailing slash in `base_url`.
:::

### Standalone Docker run (no Compose)

If your inference server runs directly on the host (not in Docker), use `host.docker.internal` on macOS/Windows, or `--network host` on Linux:

**macOS / Windows:**

```sh
docker run -d \
  --name chippi \
  -v ~/.chippi:/opt/data \
  -p 8642:8642 \
  nousresearch/chippi-agent gateway run
```

```yaml
# config.yaml
model:
  provider: custom
  model: my-model
  base_url: http://host.docker.internal:8000/v1
  api_key: "none"
```

**Linux (host networking):**

```sh
docker run -d \
  --name chippi \
  --network host \
  -v ~/.chippi:/opt/data \
  nousresearch/chippi-agent gateway run
```

```yaml
# config.yaml
model:
  provider: custom
  model: my-model
  base_url: http://127.0.0.1:8000/v1
  api_key: "none"
```

:::warning With `--network host`, the `-p` flag is ignored — all container ports are directly exposed on the host.
:::

### Verifying connectivity

From inside the Chippi container, confirm the inference server is reachable:

```sh
docker exec chippi curl -s http://vllm:8000/v1/models
```

You should see a JSON response listing your served model. If this fails, check:

1. Both containers are on the same Docker network (`docker network inspect chippi-net`)
2. The inference server is listening on `0.0.0.0`, not `127.0.0.1`
3. The port number matches

### Ollama

Ollama works the same way. If Ollama runs on the host, use `host.docker.internal:11434` (macOS/Windows) or `127.0.0.1:11434` (Linux with `--network host`). If Ollama runs in its own container on the same Docker network:

```yaml
model:
  provider: custom
  model: llama3
  base_url: http://ollama:11434/v1
  api_key: "none"
```

## Troubleshooting

### Container exits immediately

Check logs: `docker logs chippi`. Common causes:
- Missing or invalid `.env` file — run interactively first to complete setup
- Port conflicts if running with exposed ports

### "Permission denied" errors

The container's stage2 hook drops privileges to the non-root `chippi` user (UID 10000) via `s6-setuidgid` inside each supervised service. If your host `~/.chippi/` is owned by a different UID, set `CHIPPI_UID`/`CHIPPI_GID` to match your host user, or ensure the data directory is writable:

```sh
chmod -R 755 ~/.chippi
```

### Browser tools not working

Playwright needs shared memory. Add `--shm-size=1g` to your Docker run command:

```sh
docker run -d \
  --name chippi \
  --shm-size=1g \
  -v ~/.chippi:/opt/data \
  nousresearch/chippi-agent gateway run
```

### Gateway not reconnecting after network issues

The `--restart unless-stopped` flag handles most transient failures. If the gateway is stuck, restart the container:

```sh
docker restart chippi
```

### Checking container health

```sh
docker logs --tail 50 chippi          # Recent logs
docker run -it --rm nousresearch/chippi-agent:latest version     # Verify version
docker stats chippi                    # Resource usage
```
