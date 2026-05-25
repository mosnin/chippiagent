"""Draft message tool — Chippi never sends, only drafts.

Every contact-facing message lands in the realtor's approval inbox as an
AgentDraft. The realtor approves before anything ships. There is no "send"
mode, no autonomy override, no confidence gate. One trust boundary.

The tool auto-dedupes: if a draft for the same contact + channel was created
in the last 48 hours and is still pending, the existing draft is returned
instead of a new one. Prevents the agent from burying the realtor in copies
when it loops.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from errors import from_supabase_error, from_exception
from security.context import AgentContext
from tools.activities import persist_log
from tools.base import idempotent_tool, with_retry
from tools.streaming import publish_event

_VALID_CHANNELS = {"sms", "email", "note"}
_DEDUPE_WINDOW_HOURS = 48


@function_tool
@idempotent_tool
async def draft_message(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    channel: str,
    content: str,
    reasoning: str,
    subject: str | None = None,
    deal_id: str | None = None,
    priority: int = 0,
) -> dict[str, Any]:
    """Create a pending draft message for the realtor to approve.

    channel: 'sms' | 'email' | 'note'.
    subject: required when channel == 'email'.
    content: message body. Keep SMS under 160 chars.
    reasoning: why this outreach is warranted (visible to the realtor).
    priority: 0 (normal) to 100 (urgent) — affects inbox ordering.

    Auto-dedup: if a pending draft exists for the same contact+channel from
    the last 48h, returns it instead of creating a duplicate.

    Returns: { "action": "drafted" | "deduped", "draftId": "...", ... }
    """
    space_id = ctx.context.space_id

    if channel not in _VALID_CHANNELS:
        agent_err = from_supabase_error({"message": f"channel must be one of {_VALID_CHANNELS}", "code": None})
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}
    if channel == "email" and not subject:
        agent_err = from_supabase_error({"message": "subject is required for email channel", "code": None})
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}

    db = await supabase()

    check = await (
        db.table("Contact")
        .select("id,name")
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )
    if not check.data:
        agent_err = from_supabase_error({"message": "Contact not found in space", "code": None})
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}
    contact_name = check.data.get("name", "contact")

    # ── Dedup: existing pending draft for same contact+channel in window ──
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=_DEDUPE_WINDOW_HOURS)).isoformat()
    existing = await (
        db.table("AgentDraft")
        .select("id,channel,content,createdAt")
        .eq("spaceId", space_id)
        .eq("contactId", contact_id)
        .eq("channel", channel)
        .eq("status", "pending")
        .gte("createdAt", cutoff)
        .order("createdAt", desc=True)
        .limit(1)
        .execute()
    )
    if existing.data:
        prior = existing.data[0]
        return {
            "action": "deduped",
            "draftId": prior["id"],
            "contactId": contact_id,
            "channel": channel,
            "note": "A pending draft for this contact already exists from the last 48h.",
        }

    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    draft = {
        "id": str(uuid.uuid4()),
        "spaceId": space_id,
        "contactId": contact_id,
        "dealId": deal_id,
        "channel": channel,
        "subject": subject,
        "content": content,
        "reasoning": reasoning,
        "priority": max(0, min(100, priority)),
        "status": "pending",
        "expiresAt": expires_at,
    }

    try:
        result = await with_retry(lambda: db.table("AgentDraft").insert(draft).execute())
    except Exception as e:
        agent_err = from_exception(e)
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}

    await publish_event(
        ctx.context,
        "draft",
        f"Draft {channel.upper()} for {contact_name} — awaiting your approval",
        metadata={"contactId": contact_id, "channel": channel},
    )

    try:
        await persist_log(
            ctx.context,
            action_type="message_drafted",
            outcome="queued_for_approval",
            reasoning=f"{channel}: {reasoning[:200]}",
            contact_id=contact_id,
            deal_id=deal_id,
        )
    except Exception:
        # The AgentDraft row already committed — logging is best-effort.
        pass

    created = result.data[0] if result.data else draft
    return {
        "action": "drafted",
        "draftId": created.get("id", ""),
        "contactId": contact_id,
        "channel": channel,
    }
