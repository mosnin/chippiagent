"""LLM provider — OpenRouter.

The agent (chat + autonomous runs, swarm, memory embeddings)
routes every model call through OpenRouter. OpenRouter is OpenAI-API
compatible, so this is a base-URL + key swap on the OpenAI client.

`configure_agents_sdk()` points the OpenAI Agents SDK's default client at
OpenRouter — that covers every `Agent` run (chat_turn, autonomous,
swarm members). `get_llm_client()` is for the direct `AsyncOpenAI` calls
(swarm planning/audit, memory embeddings).

Fallback: when `OPENROUTER_API_KEY` is absent everything falls back to
calling OpenAI directly with `OPENAI_API_KEY`, so a deploy without the
OpenRouter secret keeps working.

Keep CHAT_MODELS / DEFAULT_CHAT_MODEL in sync with lib/llm.ts.
"""

from __future__ import annotations

from openai import AsyncOpenAI

from config import settings

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# The model a workspace gets when it hasn't picked one. OpenRouter slug.
DEFAULT_CHAT_MODEL = "x-ai/grok-4.3"

# Allowlist of realtor-selectable models — mirrors CHAT_MODELS in lib/llm.ts.
CHAT_MODELS: tuple[str, ...] = (
    "openai/gpt-5.5",
    "anthropic/claude-opus-4.7",
    "x-ai/grok-4.3",
    "moonshotai/kimi-k2.6",
    "qwen/qwen3.6-flash",
)

# Embedding model — OpenRouter and OpenAI resolve this to the same
# underlying model, so stored 1536-dim vectors stay valid across the swap.
EMBEDDING_MODEL = (
    "openai/text-embedding-3-small"
    if settings.openrouter_api_key
    else "text-embedding-3-small"
)


def get_llm_client() -> AsyncOpenAI:
    """Build the shared LLM client — OpenRouter when configured, else OpenAI."""
    if settings.openrouter_api_key:
        return AsyncOpenAI(
            base_url=OPENROUTER_BASE_URL,
            api_key=settings.openrouter_api_key,
        )
    return AsyncOpenAI(api_key=settings.openai_api_key)


def openai_model(name: str) -> str:
    """Resolve a bare OpenAI model name for the active provider —
    vendor-prefixed for OpenRouter, bare for OpenAI direct."""
    return f"openai/{name}" if settings.openrouter_api_key else name


# Models to fall through on a 429, in order. Bare OpenAI names; resolved
# for the active provider by fallback_models(). Shared by the chat path
# (modal_app.chat_turn) and the autonomous path (orchestrator).
FALLBACK_MODELS: tuple[str, ...] = ("gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini")


def fallback_models() -> list[str]:
    """Resolved 429-fallback model slugs for the active provider."""
    return [openai_model(m) for m in FALLBACK_MODELS]


def resolve_chat_model(model: str | None) -> str:
    """Return a valid chat model slug — the workspace's pick or the default.

    Without OpenRouter the multi-vendor slugs don't apply, so the OpenAI-
    direct fallback collapses to a single known-good model.
    """
    if not settings.openrouter_api_key:
        return "gpt-5"
    if model and model in CHAT_MODELS:
        return model
    return DEFAULT_CHAT_MODEL


_configured = False


def configure_agents_sdk() -> None:
    """Point the OpenAI Agents SDK at OpenRouter. Idempotent; no-op without
    an OpenRouter key (the SDK then uses its OpenAI default client).

    Tracing is disabled when on OpenRouter — the SDK's trace exporter only
    speaks to OpenAI's backend, and a pure-OpenRouter deploy may not carry
    an OpenAI key at all.
    """
    global _configured
    if _configured or not settings.openrouter_api_key:
        _configured = True
        return

    from agents import set_default_openai_client, set_tracing_disabled

    set_default_openai_client(get_llm_client(), use_for_tracing=False)
    set_tracing_disabled(True)
    _configured = True


def extract_usage(result: object) -> tuple[int, int, int]:
    """Return (input, output, total) token counts from an Agents SDK run.

    Usage is accumulated on the run context — `result.context_wrapper.usage`
    — NOT on `result` itself. A bare `result.usage` does not exist on
    RunResultStreaming; reading it silently yields None and zeroes out every
    usage and budget number. Both shapes are tried so an SDK change can't
    quietly re-break metering.
    """
    usage = None
    ctx_wrapper = getattr(result, "context_wrapper", None)
    if ctx_wrapper is not None:
        usage = getattr(ctx_wrapper, "usage", None)
    if usage is None:
        usage = getattr(result, "usage", None)
    if usage is None:
        return (0, 0, 0)
    tokens_in = int(getattr(usage, "input_tokens", 0) or 0)
    tokens_out = int(getattr(usage, "output_tokens", 0) or 0)
    total = int(getattr(usage, "total_tokens", 0) or 0) or (tokens_in + tokens_out)
    return (tokens_in, tokens_out, total)
