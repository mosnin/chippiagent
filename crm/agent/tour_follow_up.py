"""Follow-up SMS after a showing finishes — autonomous-run backstop.

The TypeScript event trigger (`lib/agent/tour-follow-up.ts`) sends as
soon as the tour is marked completed. This module does the same job when
the autonomous run drains the trigger queue.

Sends through Telnyx. Status is sent. The text is an ask — how did it
feel, do they want to talk next — never a claim that a deal closed or a
time is booked / reserved / locked / held. Missing credentials fail —
they do not fall back to a pending draft.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from first_touch import first_name_of, normalize_tone, send_sms

TOUR_COMPLETED_EVENT = "tour_completed"
_DEDUPE_WINDOW_HOURS = 48
_REASON_MARK = "Tour-completed follow-up SMS"
_REASON = "Tour-completed follow-up SMS — ask how the showing felt. Sent."

_TONE_MARKS = {
    "warm": ("this is", "want to talk next"),
    "direct": ("thoughts on", "ready to talk next"),
    "formal": ("would you like to discuss",),
    "casual": ("how'd", "want to chat next"),
}


def is_tour_completed_event(event: str | None) -> bool:
    return event == TOUR_COMPLETED_EVENT


def is_tour_follow_up_draft(row: dict[str, Any] | None) -> bool:
    return bool(row) and _REASON_MARK in (row.get("reasoning") or "")


def assert_sent_draft_persist(row: dict[str, Any]) -> None:
    if row.get("status") == "pending":
        raise ValueError("tour-follow-up persist must not stay pending")
    if row.get("status") != "sent":
        raise ValueError("tour-follow-up persist must be sent")


def compose_tour_follow_up_sms(
    *,
    contact_first_name: str,
    agent_first_name: str,
    tone: str,
    property_name: str | None = None,
    business_name: str | None = None,
) -> str:
    lead = first_name_of(contact_first_name, "there")
    who = first_name_of(agent_first_name, "") or (business_name or "").strip() or "I"
    property_label = (property_name or "").strip()
    place = property_label or "the showing"
    tone_key = normalize_tone(tone)

    if tone_key == "direct":
        text = f"Hi {lead} — {who} here. Thoughts on {place}? Ready to talk next?"
    elif tone_key == "formal":
        shown = f"the showing at {property_label}" if property_label else "the showing"
        text = f"Hello {lead}, this is {who}. How was {shown}? Would you like to discuss next steps?"
    elif tone_key == "casual":
        text = f"Hey {lead}! {who} here — how'd {place} feel? Want to chat next steps?"
    else:
        text = f"Hey {lead}, this is {who}. How did {place} feel? Want to talk next steps?"

    content = " ".join(text.split()).strip()
    assert_valid_tour_follow_up_text(content, agent_token=who, tone=tone_key)
    return content


def assert_valid_tour_follow_up_text(
    content: str,
    *,
    agent_token: str,
    tone: str,
) -> None:
    if not content.strip():
        raise ValueError("tour-follow-up draft is empty")
    lower = content.lower()
    if any(word in lower for word in ("sent", "delivered", "auto-sent", "autosent")):
        raise ValueError("tour-follow-up draft claims it was sent")
    if any(
        word in lower
        for word in (
            "booked",
            "live",
            "reserved",
            "locked",
            "held",
            "is held",
            "i'll lock",
            "i’ll lock",
            "see you then",
            "see you there",
        )
    ):
        raise ValueError("tour-follow-up draft claims the showing is booked")
    if any(
        phrase in lower
        for phrase in (
            "deal is closed",
            "we closed",
            "closed the deal",
            "it's closed",
            "it’s closed",
            "you've closed",
            "you have closed",
        )
    ):
        raise ValueError("tour-follow-up draft claims the deal is closed")
    if "chippy" in lower:
        raise ValueError("tour-follow-up draft used the wrong brand spelling")
    if agent_token and agent_token not in content:
        raise ValueError("tour-follow-up draft is not in the assigned agent voice")
    marks = _TONE_MARKS[normalize_tone(tone)]
    if not any(mark in lower for mark in marks):
        raise ValueError(f"tour-follow-up draft is not in the {tone} voice")


def tour_follow_up_instruction(triggers: list[dict]) -> str | None:
    """Extra opening-prompt block for tour-completed triggers."""
    completed = [
        t
        for t in triggers
        if is_tour_completed_event(t.get("event")) and t.get("contactId")
    ]
    if not completed:
        return None
    lines = []
    for t in completed:
        line = f"- tour_completed contactId: {t['contactId']}"
        if t.get("tourId"):
            line += f" tourId: {t['tourId']}"
        lines.append(line)
    return (
        "TOUR FOLLOW-UP — a showing just finished. Send one short SMS "
        "in the assigned realtor's voice asking how it felt and whether "
        "they want to talk next steps. Do not park a draft. Do not wait "
        "for approval. Do not claim a deal is closed or a time is booked, "
        "reserved, locked, or held.\n" + "\n".join(lines)
    )


def _skipped(contact_id: str, reason: str) -> dict[str, Any]:
    return {
        "action": "skipped",
        "contactId": contact_id,
        "status": "skipped",
        "channel": "sms",
        "content": "",
        "sent": False,
        "reason": reason,
    }


def _property_from_tour_or_contact(
    tour: dict[str, Any] | None,
    contact: dict[str, Any],
) -> str | None:
    if tour:
        address = (tour.get("propertyAddress") or "").strip()
        if address:
            return address
    address = (contact.get("address") or "").strip()
    if address:
        return address
    for item in contact.get("properties") or []:
        if isinstance(item, str) and item.strip():
            return item.strip()
    data = contact.get("applicationData")
    if isinstance(data, dict):
        for key in (
            "address",
            "propertyAddress",
            "listingAddress",
            "property",
            "interestedProperty",
        ):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


async def ensure_tour_follow_up_draft(
    space_id: str,
    contact_id: str,
    *,
    tour_id: str | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Send a tour-follow-up SMS. Persists sent. Never parks pending."""
    from db import supabase
    from tools.base import with_retry

    when = now or datetime.now(timezone.utc)
    db = await supabase()

    check = await (
        db.table("Contact")
        .select("id,name,phone,address,properties,applicationData")
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )
    if not check.data:
        return {"error": "Contact not found in space", "sent": False}

    contact = check.data
    tour_q = (
        db.table("Tour")
        .select("id,status,propertyAddress,contactId,spaceId,updatedAt")
        .eq("spaceId", space_id)
        .eq("status", "completed")
    )
    if tour_id:
        tour_q = tour_q.eq("id", tour_id)
    else:
        tour_q = tour_q.eq("contactId", contact_id)
    tours = await tour_q.order("updatedAt", desc=True).limit(1).execute()
    tour = tours.data[0] if tours.data else None
    if not tour or tour.get("status") != "completed":
        return _skipped(contact_id, "no_completed_tour")
    if tour.get("contactId") and tour.get("contactId") != contact_id:
        return _skipped(contact_id, "tour_contact_mismatch")

    cutoff = (when - timedelta(hours=_DEDUPE_WINDOW_HOURS)).isoformat()
    existing = await (
        db.table("AgentDraft")
        .select("id,content,status,channel,reasoning,createdAt")
        .eq("spaceId", space_id)
        .eq("contactId", contact_id)
        .eq("channel", "sms")
        .gte("createdAt", cutoff)
        .order("createdAt", desc=True)
        .limit(20)
        .execute()
    )
    drafts = existing.data or []
    already_sent = next(
        (
            row
            for row in drafts
            if is_tour_follow_up_draft(row)
            and row.get("status") == "sent"
            and (row.get("content") or "").strip()
        ),
        None,
    )
    empty_stub = next(
        (
            row
            for row in drafts
            if is_tour_follow_up_draft(row) and not (row.get("content") or "").strip()
        ),
        None,
    )

    profile_res = await (
        db.table("AIUserProfile")
        .select("displayName,communicationTone")
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )
    setting_res = await (
        db.table("SpaceSetting")
        .select("businessName")
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )
    space_res = await (
        db.table("Space").select("name").eq("id", space_id).maybe_single().execute()
    )
    profile = profile_res.data or {}
    setting = setting_res.data or {}
    space = space_res.data or {}

    agent_name = first_name_of(profile.get("displayName"), "")
    business = (setting.get("businessName") or space.get("name") or "").strip() or None
    if not agent_name:
        agent_name = business or "I"

    content = compose_tour_follow_up_sms(
        contact_first_name=first_name_of(contact.get("name"), "there"),
        agent_first_name=agent_name,
        tone=normalize_tone(profile.get("communicationTone")),
        property_name=_property_from_tour_or_contact(tour, contact),
        business_name=business,
    )
    if not content.strip():
        raise ValueError("tour-follow-up draft is empty")

    if already_sent:
        return {
            "action": "deduped",
            "draftId": already_sent["id"],
            "status": "sent",
            "channel": "sms",
            "content": already_sent["content"],
            "sent": True,
        }

    await send_sms(to=contact.get("phone"), body=content, label="tour-follow-up")

    expires_at = (when + timedelta(days=7)).isoformat()
    if empty_stub:
        update = {
            "content": content,
            "reasoning": _REASON,
            "priority": 82,
            "status": "sent",
            "expiresAt": expires_at,
            "updatedAt": when.isoformat(),
        }
        assert_sent_draft_persist(update)
        await with_retry(
            lambda: db.table("AgentDraft")
            .update(update)
            .eq("id", empty_stub["id"])
            .eq("spaceId", space_id)
            .execute()
        )
        return {
            "action": "filled",
            "draftId": empty_stub["id"],
            "status": "sent",
            "channel": "sms",
            "content": content,
            "sent": True,
        }

    draft = {
        "id": str(uuid.uuid4()),
        "spaceId": space_id,
        "contactId": contact_id,
        "channel": "sms",
        "content": content,
        "reasoning": _REASON,
        "priority": 82,
        "status": "sent",
        "expiresAt": expires_at,
    }
    assert_sent_draft_persist(draft)
    result = await with_retry(lambda: db.table("AgentDraft").insert(draft).execute())
    created = result.data[0] if result.data else draft
    return {
        "action": "sent",
        "draftId": created.get("id", draft["id"]),
        "status": "sent",
        "channel": "sms",
        "content": content,
        "sent": True,
    }
