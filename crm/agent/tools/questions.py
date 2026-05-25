"""Question tool — agents use this to ask the realtor for guidance when uncertain."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext
from tools.streaming import publish_event


@function_tool
async def ask_realtor(
    ctx: RunContextWrapper[AgentContext],
    question: str,
    context: str | None = None,
    contact_id: str | None = None,
    priority: int = 0,
) -> dict[str, Any]:
    """Ask the realtor a question when uncertain how to proceed.

    The tool returns immediately — it does NOT wait for an answer.
    The agent should continue its run; answers are delivered asynchronously.

    priority: 0=normal, 50=important, 100=urgent.
    """
    space_id = ctx.context.space_id

    # Validate question length
    if len(question) < 10:
        return {"error": "question must be at least 10 characters"}
    if len(question) > 500:
        return {"error": "question must be 500 characters or fewer"}

    if context is not None and len(context) > 1000:
        return {"error": "context must be 1000 characters or fewer"}

    db = await supabase()

    # Validate contact belongs to this space (if provided)
    if contact_id:
        check = await (
            db.table("Contact")
            .select("id")
            .eq("id", contact_id)
            .eq("spaceId", space_id)
            .execute()
        )
        if not check.data:
            return {"error": "Contact not found in space"}

    question_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    entry: dict[str, Any] = {
        "id": question_id,
        "spaceId": space_id,
        "runId": ctx.context.run_id,
        "agentType": ctx.context.current_agent_type,
        "question": question,
        "status": "pending",
        "priority": max(0, min(100, priority)),
        "createdAt": now,
    }
    if context is not None:
        entry["context"] = context
    if contact_id:
        entry["contactId"] = contact_id

    await db.table("AgentQuestion").insert(entry).execute()

    await publish_event(
        ctx.context,
        "info",
        f"Question queued for realtor: {question[:80]}",
        agent_type=ctx.context.current_agent_type,
        metadata={"questionId": question_id, "priority": priority},
    )

    return {
        "questionId": question_id,
        "status": "pending",
        "message": "Question queued for realtor review",
    }
