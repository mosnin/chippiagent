"""Streaming tool — publishes real-time progress events to the Next.js SSE endpoint.

The agent calls publish_event() throughout its run to narrate what it's doing.
These events flow: Modal agent → POST /api/agent/events → Redis → SSE → Browser.

This is the "Claude Code feel" — realtors can watch their agent work in real-time.
"""

from __future__ import annotations

from typing import Any, Literal

import httpx

from config import settings
from security.context import AgentContext

EventType = Literal['info', 'action', 'draft', 'complete', 'error']


async def publish_event(
    ctx: AgentContext,
    type: EventType,
    message: str,
    metadata: dict[str, Any] | None = None,
    agent_type: str = '',
) -> None:
    """POST a streaming event to the Next.js SSE endpoint.

    Non-blocking — failures are silently ignored so a network hiccup never
    stops the agent from doing its work.
    """
    if not settings.agent_internal_secret or not settings.app_url:
        return  # not configured — skip silently (local dev)

    payload = {
        "spaceId": ctx.space_id,
        "runId": ctx.run_id,
        "type": type,
        "message": message,
        "agentType": agent_type,
        "metadata": metadata or {},
    }

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                f"{settings.app_url}/api/agent/events",
                json=payload,
                headers={"Authorization": f"Bearer {settings.agent_internal_secret}"},
            )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).debug("Event publish failed (non-critical): %s", exc)
