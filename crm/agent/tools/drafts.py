"""Draft message tool — Chippi writes the message and sends it.

Creating a draft is a send. There is no approval inbox and no pending
status. Auto-send goes through the existing SMS/email path
(`/api/agent/send`). If delivery fails, the tool returns an error — a
pending row is never a success.

Failed sends are persisted as status='approved' + feedback_action=
'rejected' + outcome_signal='failed' so draft-stats can count them.
Successful sends are status='sent'.

The tool auto-dedupes: if a draft for the same contact + channel was
sent in the last 48 hours, the existing row is returned instead of a
second send.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from agents import RunContextWrapper, function_tool

from config import settings
from db import supabase
from errors import from_supabase_error, from_exception
from security.context import AgentContext
from tools.activities import persist_log
from tools.base import idempotent_tool, with_retry
from tools.streaming import publish_event

_VALID_CHANNELS = {"sms", "email", "note"}
_DEDUPE_WINDOW_HOURS = 48
_SEND_TIMEOUT = 15.0
_FAILED_SIGNAL = "failed"


async def _send_via_app(
    *,
    space_id: str,
    contact_id: str,
    channel: str,
    content: str,
    subject: str | None,
    run_id: str,
) -> dict[str, Any]:
    """Call the existing Next.js SMS/email send path.

    Notes are internal — no outbound delivery.
    """
    if channel == "note":
        return {"sent": True, "method": "note"}

    base_url = (settings.app_url or "").rstrip("/")
    secret = settings.agent_internal_secret
    if not base_url or not secret:
        return {"sent": False, "error": "send path is not configured"}

    payload: dict[str, Any] = {
        "contactId": contact_id,
        "spaceId": space_id,
        "channel": channel,
        "content": content,
        "runId": run_id,
    }
    if subject:
        payload["subject"] = subject

    try:
        async with httpx.AsyncClient(timeout=_SEND_TIMEOUT) as client:
            resp = await client.post(
                f"{base_url}/api/agent/send",
                json=payload,
                headers={"Authorization": f"Bearer {secret}"},
            )
    except Exception as exc:  # noqa: BLE001 — surface to the agent, never throw
        return {"sent": False, "error": f"send request failed: {exc}"}

    if resp.status_code >= 400:
        detail = ""
        try:
            detail = resp.json().get("error", "")
        except Exception:  # noqa: BLE001
            detail = resp.text[:200]
        return {"sent": False, "error": detail or f"send failed ({resp.status_code})"}

    return {"sent": True, "method": channel}


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
    """Write a contact-facing message and send it.

    channel: 'sms' | 'email' | 'note'.
    subject: required when channel == 'email'.
    content: message body. Keep SMS under 160 chars.
    reasoning: why this outreach is warranted.
    priority: 0 (normal) to 100 (urgent).

    Auto-dedup: if a sent draft exists for the same contact+channel from
    the last 48h, returns it instead of sending a duplicate.

    Returns: { "action": "sent" | "deduped", "draftId": "...", ... }
    or { "error": "...", "draftId": "..." } when delivery fails.
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

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=_DEDUPE_WINDOW_HOURS)).isoformat()
    existing = await (
        db.table("AgentDraft")
        .select("id,channel,content,createdAt")
        .eq("spaceId", space_id)
        .eq("contactId", contact_id)
        .eq("channel", channel)
        .eq("status", "sent")
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
            "note": "A sent draft for this contact already exists from the last 48h.",
        }

    delivery = await _send_via_app(
        space_id=space_id,
        contact_id=contact_id,
        channel=channel,
        content=content,
        subject=subject,
        run_id=ctx.context.run_id,
    )
    sent = bool(delivery.get("sent"))

    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    draft_id = str(uuid.uuid4())
    draft = {
        "id": draft_id,
        "spaceId": space_id,
        "contactId": contact_id,
        "dealId": deal_id,
        "channel": channel,
        "subject": subject,
        "content": content,
        "reasoning": reasoning,
        "priority": max(0, min(100, priority)),
        "status": "sent" if sent else "approved",
        "feedback_action": "approved" if sent else "rejected",
        "edit_distance": 0,
        "expiresAt": expires_at,
    }
    if not sent:
        draft["outcome_signal"] = _FAILED_SIGNAL

    if draft["status"] == "pending":
        return {"error": "pending is not allowed on new writes", "retryable": False}

    try:
        result = await with_retry(lambda: db.table("AgentDraft").insert(draft).execute())
    except Exception as e:
        agent_err = from_exception(e)
        if sent:
            return {
                "action": "sent",
                "draftId": draft_id,
                "contactId": contact_id,
                "channel": channel,
                "warning": "Message sent but draft row failed to persist",
                "error": agent_err.message,
            }
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}

    created = result.data[0] if result.data else draft

    if not sent:
        try:
            await persist_log(
                ctx.context,
                action_type="message_sent",
                outcome="failed",
                reasoning=f"{channel}: {delivery.get('error') or reasoning[:200]}",
                contact_id=contact_id,
                deal_id=deal_id,
            )
        except Exception:
            pass
        await publish_event(
            ctx.context,
            "error",
            f"Failed to send {channel.upper()} to {contact_name}",
            metadata={"contactId": contact_id, "channel": channel},
        )
        return {
            "error": delivery.get("error") or "Delivery failed",
            "draftId": created.get("id", draft_id),
            "contactId": contact_id,
            "channel": channel,
            "status": "failed",
            "retryable": True,
        }

    await publish_event(
        ctx.context,
        "action",
        f"Sent {channel.upper()} to {contact_name}",
        metadata={"contactId": contact_id, "channel": channel},
    )

    try:
        await persist_log(
            ctx.context,
            action_type="message_sent",
            outcome="completed",
            reasoning=f"{channel}: {reasoning[:200]}",
            contact_id=contact_id,
            deal_id=deal_id,
        )
    except Exception:
        pass

    return {
        "action": "sent",
        "draftId": created.get("id", draft_id),
        "contactId": contact_id,
        "channel": channel,
    }
