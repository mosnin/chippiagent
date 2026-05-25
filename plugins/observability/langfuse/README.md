# Langfuse Observability Plugin

This plugin ships bundled with Chippi but is **opt-in** — it only loads when
you explicitly enable it.

## Enable

```bash
pip install langfuse
chippi plugins enable observability/langfuse
```

Or check the box in the interactive `chippi plugins` UI.

## Required credentials

Set these in `~/.chippi/.env`:

```bash
CHIPPI_LANGFUSE_PUBLIC_KEY=pk-lf-...
CHIPPI_LANGFUSE_SECRET_KEY=sk-lf-...
CHIPPI_LANGFUSE_BASE_URL=https://cloud.langfuse.com   # or your self-hosted URL
```

Without the SDK or credentials the hooks no-op silently — the plugin fails
open.

## Verify

```bash
chippi plugins list                 # observability/langfuse should show "enabled"
chippi chat -q "hello"              # then check Langfuse for a "Chippi turn" trace
```

## Optional tuning

```bash
CHIPPI_LANGFUSE_ENV=production       # environment tag
CHIPPI_LANGFUSE_RELEASE=v1.0.0       # release tag
CHIPPI_LANGFUSE_SAMPLE_RATE=0.5      # sample 50% of traces
CHIPPI_LANGFUSE_MAX_CHARS=12000      # max chars per field (default: 12000)
CHIPPI_LANGFUSE_DEBUG=true           # verbose plugin logging
```

## Disable

```bash
chippi plugins disable observability/langfuse
```
