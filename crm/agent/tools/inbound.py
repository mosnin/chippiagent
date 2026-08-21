"""Inbound message tool — parse a reply and send now.

When a contact replies, this tool:
- Records the reply as a ContactActivity
- Updates lastContactedAt
- Analyses intent and sentiment
- Boosts the contact's lead score for engagement
- Sends the next SMS immediately — no pending draft, no human queue
"""

from __future__ import annotations

import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext
from tools.base import idempotent_tool
from tools.streaming import publish_event

_SEND_DEDUPE_HOURS = 2
_CHIPPY_RE = re.compile(r"\bchippy\b", re.IGNORECASE)


def first_name_of(full: str | None, fallback: str = "there") -> str:
    part = (full or "").strip().split()
    return part[0] if part else fallback


def compose_inbound_reply(
    contact_name: str | None,
    intent: str,
    agent_first_name: str | None = None,
) -> str:
    """Compose the next SMS. Empty string means do not send (opt-out)."""
    if intent == "opt_out":
        return ""
    lead = first_name_of(contact_name, "there")
    who = first_name_of(agent_first_name, "I")
    if intent == "positive_response":
        text = f"Hey {lead}, this is {who}. Great — which time works for you?"
    elif intent == "inquiry":
        text = f"Hey {lead}, this is {who}. Happy to help — want to pick a time to look?"
    else:
        text = f"Hey {lead}, this is {who}. Got your message — which time works for you?"
    content = re.sub(r"\s+", " ", text).strip()
    if _CHIPPY_RE.search(content):
        raise ValueError("inbound reply used the wrong brand spelling")
    return content


def detect_inbound_intent(content: str) -> tuple[str, str]:
    lower = content.lower()
    if any(w in lower for w in ["yes", "interested", "sure", "absolutely", "love to", "sounds good"]):
        return "positive_response", "positive"
    if any(w in lower for w in ["no", "not interested", "stop", "unsubscribe", "remove"]):
        return "opt_out", "negative"
    if any(w in lower for w in ["when", "where", "how", "price", "cost", "available", "?"]):
        return "inquiry", "curious"
    return "general_reply", "neutral"


def e164_phone(raw: str | None) -> str | None:
    if not raw:
        return None
    cleaned = re.sub(r"[^\d+]", "", raw)
    if len(cleaned) < 10:
        return None
    to_number = cleaned if cleaned.startswith("+") else f"+1{cleaned}"
    if not re.fullmatch(r"\+\d{10,15}", to_number):
        return None
    return to_number


async def send_sms_now(to: str, body: str) -> bool:
    """Send via Telnyx. Never parks a draft. Returns False on skip/failure."""
    if not body.strip() or _CHIPPY_RE.search(body):
        return False
    phone = e164_phone(to)
    if not phone:
        return False
    api_key = os.environ.get("TELNYX_API_KEY") or ""
    from_number = os.environ.get("TELNYX_FROM_NUMBER") or ""
    if not api_key or not from_number:
        return False
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                "https://api.telnyx.com/v2/messages",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={"from": from_number, "to": phone, "text": body},
            )
        return res.is_success
    except Exception:
        return False


@function_tool
@idempotent_tool
async def process_inbound_message(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    channel: str,
    content: str,
    draft_id: str | None = None,
) -> dict[str, Any]:
    """Process a reply received from a contact and send the next SMS now.

    channel: 'sms' | 'email'
    content: the message body received
    draft_id: the AgentDraft this is a reply to, if known

    Returns: { "recorded": true, "sent": bool, "intent": str, "sentiment": str, "score_boosted": bool }
    """
    space_id = ctx.context.space_id
    db = await supabase()

    if channel not in {"sms", "email"}:
        return {"error": f"Invalid channel '{channel}'. Must be 'sms' or 'email'"}

    # Validate contact belongs to this space
    check = await (
        db.table("Contact")
        .select("id,name,phone,leadScore")
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .execute()
    )
    if not check.data:
        return {"error": "Contact not found in space"}

    contact = check.data[0]
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

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
        .update({"lastContactedAt": now_iso, "updatedAt": now_iso})
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .execute()
    )

    # Mark draft as having received a response — never create a new pending draft.
    score_boosted = False
    if draft_id:
        await (
            db.table("AgentDraft")
            .update({
                "outcome": "responded",
                "outcomeDetectedAt": now_iso,
                "updatedAt": now_iso,
            })
            .eq("id", draft_id)
            .eq("spaceId", space_id)
            .execute()
        )

    intent, sentiment = detect_inbound_intent(content)

    # Boost lead score for positive engagement (cap at 100)
    if intent in ("positive_response", "inquiry"):
        current_score = contact.get("leadScore") or 50
        new_score = min(100, current_score + 10)
        await (
            db.table("Contact")
            .update({"leadScore": new_score, "updatedAt": now_iso})
            .eq("id", contact_id)
            .eq("spaceId", space_id)
            .execute()
        )
        score_boosted = True

    sent = False
    reply_body = ""
    if intent != "opt_out":
        profile = await (
            db.table("AIUserProfile")
            .select("displayName")
            .eq("spaceId", space_id)
            .maybe_single()
            .execute()
        )
        agent_name = (profile.data or {}).get("displayName") if profile else None
        reply_body = compose_inbound_reply(contact.get("name"), intent, agent_name)

        already_sent = False
        cutoff = (now - timedelta(hours=_SEND_DEDUPE_HOURS)).isoformat()
        recent = await (
            db.table("ContactActivity")
            .select("id,metadata")
            .eq("contactId", contact_id)
            .eq("spaceId", space_id)
            .gte("createdAt", cutoff)
            .limit(20)
            .execute()
        )
        for row in recent.data or []:
            meta = row.get("metadata") or {}
            if meta.get("via") == "trigger_send" and meta.get("event") == "inbound_message":
                already_sent = True
                break

        if reply_body and not already_sent:
            sent = await send_sms_now(contact.get("phone") or "", reply_body)
            if sent:
                await db.table("ContactActivity").insert({
                    "id": str(uuid.uuid4()),
                    "contactId": contact_id,
                    "spaceId": space_id,
                    "type": "note",
                    "content": f"SMS: {reply_body[:140]}{'…' if len(reply_body) > 140 else ''}",
                    "metadata": {
                        "channel": "sms",
                        "via": "trigger_send",
                        "event": "inbound_message",
                        "agentRunId": ctx.context.run_id,
                    },
                }).execute()

    await publish_event(
        ctx.context,
        "action",
        f"Inbound {channel.upper()} from {contact.get('name', contact_id)}: {intent.replace('_', ' ')}",
        agent_type=ctx.context.current_agent_type,
        metadata={"contactId": contact_id, "intent": intent, "sentiment": sentiment, "sent": sent},
    )

    return {
        "recorded": True,
        "sent": sent,
        "contactId": contact_id,
        "contactName": contact.get("name"),
        "channel": channel,
        "intent": intent,
        "sentiment": sentiment,
        "score_boosted": score_boosted,
        "reply": reply_body or None,
    }
