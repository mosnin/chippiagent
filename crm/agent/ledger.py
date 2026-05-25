"""Chat-turn usage recorder.

Records the token cost of a completed interactive chat turn into a ChatUsage
row. The write is non-blocking — a telemetry failure must never break a chat
turn. The TS runtime has an equivalent in lib/usage/record-chat-usage.ts;
both target the same table.
"""

from __future__ import annotations

import structlog

from db import supabase

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Pricing table — per 1M tokens, USD
# ---------------------------------------------------------------------------

MODEL_PRICES: dict[str, dict[str, float]] = {
    # Bare OpenAI slugs — OpenAI-direct fallback path.
    "gpt-5-mini":   {"in": 0.75, "out": 4.50},
    "gpt-5.4-mini": {"in": 0.75, "out": 4.50},
    "gpt-4.1-mini": {"in": 0.40, "out": 1.60},
    "gpt-4o":       {"in": 2.50, "out": 10.00},
    "gpt-4.1":      {"in": 2.00, "out": 8.00},
    "gpt-4o-mini":  {"in": 0.15, "out": 0.60},
    # OpenRouter slugs — realtor-pickable chat models + the autonomous
    # fallback chain. Mirrors lib/usage/record-chat-usage.ts; keep in sync.
    "openai/gpt-5.5":            {"in": 5.00, "out": 30.00},
    "openai/gpt-5-mini":         {"in": 0.75, "out": 4.50},
    "openai/gpt-4.1-mini":       {"in": 0.40, "out": 1.60},
    "openai/gpt-4o-mini":        {"in": 0.15, "out": 0.60},
    "x-ai/grok-4.3":             {"in": 1.25, "out": 2.50},
    "anthropic/claude-opus-4.7": {"in": 5.00, "out": 25.00},
    "moonshotai/kimi-k2.6":      {"in": 0.73, "out": 3.49},
    "qwen/qwen3.6-flash":        {"in": 0.19, "out": 1.13},
}
_DEFAULT_PRICE = {"in": 2.50, "out": 10.00}


def _calculate_cost(model: str, tokens_in: int, tokens_out: int) -> float:
    """Return cost in USD, rounded to 6 decimal places (matches numeric(10,6))."""
    prices = MODEL_PRICES.get(model, _DEFAULT_PRICE)
    cost = (tokens_in / 1_000_000) * prices["in"] + (tokens_out / 1_000_000) * prices["out"]
    return round(cost, 6)


# ---------------------------------------------------------------------------
# Chat-turn usage — interactive chat (ChatUsage table)
# ---------------------------------------------------------------------------

async def record_chat_usage(
    space_id: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    user_id: str | None = None,
    conversation_id: str | None = None,
    runtime: str = "modal",
) -> None:
    """Insert one ChatUsage row for a completed interactive chat turn.

    The TS runtime has an equivalent in lib/usage/record-chat-usage.ts —
    both target the same table. Never raises: a telemetry write must not
    break a chat turn. Zero-token turns are skipped (no billable usage).
    """
    prompt_tokens = max(0, int(prompt_tokens or 0))
    completion_tokens = max(0, int(completion_tokens or 0))
    if prompt_tokens == 0 and completion_tokens == 0:
        return
    try:
        db = await supabase()
        await (
            db.table("ChatUsage")
            .insert({
                "spaceId": space_id,
                "userId": user_id,
                "conversationId": conversation_id,
                "model": model,
                "promptTokens": prompt_tokens,
                "completionTokens": completion_tokens,
                "costUsd": _calculate_cost(model, prompt_tokens, completion_tokens),
                "runtime": runtime,
            })
            .execute()
        )
    except Exception:
        logger.warning("record_chat_usage_failed", space_id=space_id)
