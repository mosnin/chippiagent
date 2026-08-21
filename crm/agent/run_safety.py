"""Runtime safety helpers for autonomous Chippi runs.

Extracted so the orchestrator can be tested without importing the Agents SDK.
These exist to stop four failure modes:

  - stalled streams that sit until Modal kills the container
  - popped triggers that never get requeued
  - AgentContext bound to a different space than the Space we loaded
  - silent excepts that hide a dead stream or a lost event
"""

from __future__ import annotations

from typing import Any

# Modal run_now / run_space timeout is 600s. Leave a minute to requeue
# popped triggers and release the per-space lock before the hard kill.
STREAM_TIMEOUT_S = 540


def bind_space_id(*, space_id: str, settings_space_id: str) -> str:
    """Return the Space id only when AgentSettings.spaceId agrees.

    Tools read AgentContext.space_id. The trigger queue and first-touch
    path use Space.id. If those diverge, Chippi writes into the wrong
    tenant. Refuse the run instead of guessing.
    """
    space_id = (space_id or "").strip()
    settings_space_id = (settings_space_id or "").strip()
    if not space_id:
        raise ValueError("space_id required")
    if settings_space_id != space_id:
        raise ValueError(
            f"tenant mismatch: space.id={space_id} "
            f"AgentSettings.spaceId={settings_space_id}"
        )
    return space_id


def coerce_lpop_items(items: Any) -> list:
    """Normalize Redis LPOP output to a list of queue entries.

    LPOP-with-count should return a list. Some clients return a single
    string when the list has one element. Iterating that string walks
    characters, every json.loads fails, and the popped trigger is gone.
    """
    if items is None:
        return []
    if isinstance(items, (str, bytes, bytearray, dict)):
        return [items]
    try:
        return list(items)
    except TypeError:
        return [items]


def stored_stream_error(result: object) -> BaseException | None:
    """Exception parked on a streamed run after stream_events() ends.

    Some Agents SDK versions finish the iterator without raising and
    stash the failure on the result. Treating that as success consumes
    the trigger.
    """
    for attr in ("_exception", "exception"):
        exc = getattr(result, attr, None)
        if isinstance(exc, BaseException):
            return exc
    return None


def cancel_stream(result: object) -> None:
    """Best-effort cancel of a hung streamed run."""
    cancel = getattr(result, "cancel", None)
    if callable(cancel):
        cancel()
