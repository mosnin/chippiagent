"""Inbound message tool — parse and process a reply from a contact.

When a contact replies to an outreach, the agent can call this tool to:
- Record the reply as a ContactActivity
- Update lastContactedAt
- Analyse intent and sentiment
- Boost the contact's lead score for engagement
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext
from tools.base import idempotent_tool
from tools.streaming import publish_event


@function_tool
@idempotent_tool
async def process_inbound_message(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    channel: str,
    content: str,
    draft_id: str | None = None,
) -> dict[str, Any]:
    """Process a reply received from a contact.

    channel: 'sms' | 'email'
    content: the message body received
    draft_id: the AgentDraft this is a reply to, if known

    Returns: { "recorded": true, "intent": str, "sentiment": str, "score_boosted": bool }
    """
    space_id = ctx.context.space_id
    db = await supabase()

    if channel not in {"sms", "email"}:
        return {"error": f"Invalid channel '{channel}'. Must be 'sms' or 'email'"}

    # Validate contact belongs to this space
    check = await (
        db.table("Contact")
        .select("id,name,leadScore")
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .execute()
    )
    if not check.data:
        return {"error": "Contact not found in space"}

    contact = check.data[0]
    now = datetime.now(timezone.utc).isoformat()

    # Record as ContactActivity
    await db.table("ContactActivity").insert({
        "id": str(uuid.uuid4()),
        "contactId": contact_id,
        "spaceId": space_id,
        "type": "note",
        "content": f"[Inbound {channel.upper()}] {content[:500]}",
        "metadata": {
            "source": "inbound",
            "channel": channel,
            "draftId": draft_id,
            "agentRunId": ctx.context.run_id,
        },
    }).execute()

    # Update lastContactedAt (inbound counts as recent contact)
    await (
        db.table("Contact")
        .update({"lastContactedAt": now, "updatedAt": now})
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .execute()
    )

    # Mark draft as having received a response
    score_boosted = False
    if draft_id:
        await (
            db.table("AgentDraft")
            .update({
                "outcome": "responded",
                "outcomeDetectedAt": now,
                "updatedAt": now,
            })
            .eq("id", draft_id)
            .eq("spaceId", space_id)
            .execute()
        )

    # Simple intent detection from keywords
    lower = content.lower()
    if any(w in lower for w in ["yes", "interested", "sure", "absolutely", "love to", "sounds good"]):
        intent = "positive_response"
        sentiment = "positive"
    elif any(w in lower for w in ["no", "not interested", "stop", "unsubscribe", "remove"]):
        intent = "opt_out"
        sentiment = "negative"
    elif any(w in lower for w in ["when", "where", "how", "price", "cost", "available", "?"]):
        intent = "inquiry"
        sentiment = "curious"
    else:
        intent = "general_reply"
        sentiment = "neutral"

    # Boost lead score for positive engagement (cap at 100)
    if intent in ("positive_response", "inquiry"):
        current_score = contact.get("leadScore") or 50
        new_score = min(100, current_score + 10)
        await (
            db.table("Contact")
            .update({"leadScore": new_score, "updatedAt": now})
            .eq("id", contact_id)
            .eq("spaceId", space_id)
            .execute()
        )
        score_boosted = True

    await publish_event(
        ctx.context,
        "action",
        f"Inbound {channel.upper()} from {contact.get('name', contact_id)}: {intent.replace('_', ' ')}",
        agent_type=ctx.context.current_agent_type,
        metadata={"contactId": contact_id, "intent": intent, "sentiment": sentiment},
    )

    return {
        "recorded": True,
        "contactId": contact_id,
        "contactName": contact.get("name"),
        "channel": channel,
        "intent": intent,
        "sentiment": sentiment,
        "score_boosted": score_boosted,
    }
