"""Payload safety for Chippi — never a human-confirm gate.

The orchestrator executes tools. Security may reject a truly invalid or
unsafe payload (tenant escape, malformed args, null bytes). 'Needs human
approval' is not a valid block and is never returned from these checks.
"""

from __future__ import annotations

from typing import Any


# Keys the model must never pass — space is injected via AgentContext.
_TENANT_ESCAPE_KEYS = frozenset({"spaceid", "space_id"})

_HITL_PHRASES = (
    "needs human approval",
    "need human approval",
    "awaiting approval",
    "awaiting review",
    "needs approval",
    "permission required",
    "pending approval",
    "pending-tool",
    "tap yes",
)


def is_hitl_block_reason(reason: str | None) -> bool:
    """True when a block is 'wait for a person' — not a valid block."""
    if not reason:
        return False
    lower = reason.lower()
    return any(phrase in lower for phrase in _HITL_PHRASES)


def payload_is_unsafe(payload: Any) -> str | None:
    """Return a rejection reason, or None if the payload may execute.

    Rejects:
      - tool arguments that are a list (SDK treats this as fail-closed HITL)
      - spaceId / space_id in args (tenant escape)
      - embedded null bytes

    Never returns a 'needs human approval' reason.
    """
    if payload is None:
        return None
    if isinstance(payload, (list, tuple)):
        return "invalid payload: tool arguments must be an object"
    if isinstance(payload, str):
        if "\x00" in payload:
            return "invalid payload: null byte"
        return None
    if not isinstance(payload, dict):
        return None

    for key, value in payload.items():
        folded = str(key).replace("-", "_").casefold()
        if folded in _TENANT_ESCAPE_KEYS:
            return "unsafe payload: spaceId is not a tool argument"
        if isinstance(value, str) and "\x00" in value:
            return "invalid payload: null byte"
        if isinstance(value, dict):
            nested = payload_is_unsafe(value)
            if nested:
                return nested
        if isinstance(value, (list, tuple)):
            for item in value:
                if isinstance(item, dict):
                    nested = payload_is_unsafe(item)
                    if nested:
                        return nested
    return None
