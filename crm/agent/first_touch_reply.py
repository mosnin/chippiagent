"""Booking SMS after a lead replies to first-touch — autonomous-run backstop.

The TypeScript event trigger (`lib/agent/first-touch-reply.ts`) sends as
soon as the inbound SMS lands. This module does the same job when the
autonomous run drains the trigger queue.

Sends through Telnyx. Status is sent. Confirm the time they picked, or
offer two concrete showing windows. Voice comes from AIUserProfile.
Missing credentials fail — they do not fall back to a pending draft.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from first_touch import (
    compose_first_touch_sms,
    first_name_of,
    normalize_tone,
    propose_two_showing_windows,
    send_sms,
)

INBOUND_MESSAGE_EVENT = "inbound_message"
_DEDUPE_WINDOW_HOURS = 48
_FIRST_TOUCH_LOOKBACK_DAYS = 14
_FIRST_TOUCH_REASON_MARK = "First-touch SMS"
_REPLY_REASON = "Reply to first-touch — book a showing. Sent."

_WINDOW_LABEL_RE = re.compile(
    r"\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}(?::\d{2})?(?:am|pm)\b",
    re.IGNORECASE,
)
_DAY_ALIASES = {
    "mon": ("mon", "monday"),
    "tue": ("tue", "tues", "tuesday"),
    "wed": ("wed", "wednesday"),
    "thu": ("thu", "thur", "thurs", "thursday"),
    "fri": ("fri", "friday"),
    "sat": ("sat", "saturday"),
    "sun": ("sun", "sunday"),
}
_CONFIRM_MARKS = {
    "warm": ("does that still work",),
    "direct": ("still work for you",),
    "formal": ("still work for you",),
    "casual": ("still good",),
}


def is_inbound_message_event(event: str | None) -> bool:
    return event == INBOUND_MESSAGE_EVENT


def is_first_touch_draft(row: dict[str, Any] | None) -> bool:
    return bool(row) and _FIRST_TOUCH_REASON_MARK in (row.get("reasoning") or "")


def is_first_touch_reply_draft(row: dict[str, Any] | None) -> bool:
    return bool(row) and "Reply to first-touch" in (row.get("reasoning") or "")


def extract_window_labels(text: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for match in _WINDOW_LABEL_RE.findall(text or ""):
        if match in seen:
            continue
        seen.add(match)
        out.append(match)
    return out


def pick_offered_window(reply: str, offered: list[str]) -> str | None:
    if not (reply or "").strip() or not offered:
        return None
    lower = reply.lower()
    exact = [window for window in offered if window.lower() in lower]
    if len(exact) == 1:
        return exact[0]

    day_hits = []
    for window in offered:
        day = window.split()[0][:3].lower() if window.split() else ""
        aliases = _DAY_ALIASES.get(day, (day,))
        if any(re.search(rf"\b{re.escape(alias)}\b", reply, re.IGNORECASE) for alias in aliases):
            day_hits.append(window)
    if len(day_hits) == 1:
        return day_hits[0]

    time_hits = []
    for window in offered:
        parts = window.split()
        if len(parts) > 1 and parts[1].lower() in lower:
            time_hits.append(window)
    if len(time_hits) == 1:
        return time_hits[0]

    if re.search(r"\b(first|1st|earlier|the first one)\b", reply, re.IGNORECASE):
        return offered[0]
    if re.search(r"\b(second|2nd|later|the other|the second)\b", reply, re.IGNORECASE) and len(
        offered
    ) > 1:
        return offered[1]
    return None


def compose_first_touch_reply_sms(
    *,
    contact_first_name: str,
    agent_first_name: str,
    tone: str,
    windows: list[dict[str, Any]],
    picked: str | None = None,
    property_name: str | None = None,
    business_name: str | None = None,
) -> str:
    lead = first_name_of(contact_first_name, "there")
    who = first_name_of(agent_first_name, "") or (business_name or "").strip() or "I"
    tone_key = normalize_tone(tone)

    if picked:
        picked_label = picked.strip()
        if not picked_label:
            raise ValueError("first-touch reply draft is empty")
        if tone_key == "direct":
            text = f"Hi {lead} — {who} here. {picked_label} still work for you?"
        elif tone_key == "formal":
            text = f"Hello {lead}, this is {who}. Would {picked_label} still work for you?"
        elif tone_key == "casual":
            text = f"Hey {lead}! {who} here — {picked_label} still good?"
        else:
            text = f"Hey {lead}, this is {who}. I can do {picked_label} — does that still work?"
        content = " ".join(text.split()).strip()
        assert_valid_first_touch_reply_text(
            content, windows=[picked_label], agent_token=who, tone=tone_key, picked=picked_label
        )
        return content

    return compose_first_touch_sms(
        contact_first_name=contact_first_name,
        agent_first_name=agent_first_name,
        tone=tone,
        windows=windows,
        property_name=property_name,
        business_name=business_name,
    )


def assert_valid_first_touch_reply_text(
    content: str,
    *,
    windows: list[str],
    agent_token: str,
    tone: str,
    picked: str | None = None,
) -> None:
    if not content.strip():
        raise ValueError("first-touch reply draft is empty")
    lower = content.lower()
    if any(word in lower for word in ("sent", "delivered", "auto-sent", "autosent")):
        raise ValueError("first-touch reply draft claims it was sent")
    if any(
        word in lower
        for word in (
            "booked",
            "live",
            "reserved",
            "locked",
            "is held",
            "i'll lock",
            "i’ll lock",
            "see you then",
            "see you there",
        )
    ):
        raise ValueError("first-touch reply draft claims the showing is booked")
    if "chippy" in lower:
        raise ValueError("first-touch reply draft used the wrong brand spelling")
    if agent_token and agent_token not in content:
        raise ValueError("first-touch reply draft is not in the assigned agent voice")
    if picked:
        if picked not in content:
            raise ValueError(f"first-touch reply draft missing confirmed window: {picked}")
        marks = _CONFIRM_MARKS[normalize_tone(tone)]
        if not any(mark in lower for mark in marks):
            raise ValueError(f"first-touch reply draft is not in the {tone} voice")
        return
    if len(windows) < 2:
        raise ValueError("first-touch reply SMS requires two showing windows")
    for window in windows:
        if window not in content:
            raise ValueError(f"first-touch reply draft missing showing window: {window}")


def first_touch_reply_instruction(triggers: list[dict]) -> str | None:
    inbound = [
        t
        for t in triggers
        if is_inbound_message_event(t.get("event")) and t.get("contactId")
    ]
    if not inbound:
        return None
    lines = []
    for t in inbound:
        lines.append(f"- inbound_message contactId: {t['contactId']}")
    return (
        "FIRST-TOUCH REPLY — the lead answered the first-touch SMS. Send one "
        "short SMS in the assigned realtor's voice that books the showing: "
        "confirm the time they picked, or offer two concrete windows. Do not "
        "park a draft. Do not wait for approval.\n" + "\n".join(lines)
    )


def _property_from_contact(contact: dict[str, Any]) -> str | None:
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


def _skipped(contact_id: str, reason: str) -> dict[str, Any]:
    return {
        "action": "skipped",
        "contactId": contact_id,
        "status": "skipped",
        "channel": "sms",
        "content": "",
        "windows": [],
        "sent": False,
        "reason": reason,
    }


async def ensure_first_touch_reply_draft(
    space_id: str,
    contact_id: str,
    *,
    reply_text: str | None = None,
    source_draft_id: str | None = None,
    channel: str | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Send a first-touch-reply SMS. Persists sent. Never parks pending."""
    from db import supabase
    from tools.base import with_retry

    if channel and channel != "sms":
        return _skipped(contact_id, "not_sms")

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
    cutoff = (when - timedelta(days=_FIRST_TOUCH_LOOKBACK_DAYS)).isoformat()
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
    source = next((row for row in drafts if row.get("id") == source_draft_id), None)
    first_touch = (
        source
        if source and source.get("status") != "dismissed"
        else next(
            (
                row
                for row in drafts
                if is_first_touch_draft(row) and row.get("status") != "dismissed"
            ),
            None,
        )
    )
    if not first_touch:
        return _skipped(contact_id, "no_first_touch")

    reply_cutoff = when - timedelta(hours=_DEDUPE_WINDOW_HOURS)

    def _in_window(row: dict[str, Any]) -> bool:
        created = row.get("createdAt")
        if not created:
            return True
        try:
            created_at = datetime.fromisoformat(created.replace("Z", "+00:00"))
            return created_at >= reply_cutoff
        except ValueError:
            return True

    already_sent = next(
        (
            row
            for row in drafts
            if is_first_touch_reply_draft(row)
            and row.get("status") == "sent"
            and (row.get("content") or "").strip()
            and _in_window(row)
        ),
        None,
    )
    empty_stub = next(
        (
            row
            for row in drafts
            if is_first_touch_reply_draft(row)
            and not (row.get("content") or "").strip()
            and _in_window(row)
        ),
        None,
    )

    if already_sent:
        return {
            "action": "deduped",
            "draftId": already_sent["id"],
            "status": "sent",
            "channel": "sms",
            "content": already_sent["content"],
            "sent": True,
        }

    profile_res = await (
        db.table("AIUserProfile")
        .select("displayName,communicationTone")
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )
    setting_res = await (
        db.table("SpaceSetting")
        .select("businessName,timezone,tourStartHour,tourEndHour,tourDaysAvailable")
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

    offered = extract_window_labels(first_touch.get("content") or "")
    picked = pick_offered_window(reply_text or "", offered)
    if picked:
        windows = [{"label": picked}]
    else:
        windows = propose_two_showing_windows(
            when,
            start_hour=setting.get("tourStartHour") or 9,
            end_hour=setting.get("tourEndHour") or 17,
            days_available=setting.get("tourDaysAvailable") or None,
        )
        if len(windows) < 2:
            return {"error": "could not propose two showing windows", "sent": False}

    content = compose_first_touch_reply_sms(
        contact_first_name=first_name_of(contact.get("name"), "there"),
        agent_first_name=agent_name,
        tone=normalize_tone(profile.get("communicationTone")),
        windows=windows,
        picked=picked,
        property_name=_property_from_contact(contact),
        business_name=business,
    )
    if not content.strip():
        raise ValueError("first-touch reply draft is empty")

    await send_sms(to=contact.get("phone"), body=content, label="first-touch-reply")

    expires_at = (when + timedelta(days=7)).isoformat()
    if empty_stub:
        await with_retry(
            lambda: db.table("AgentDraft")
            .update(
                {
                    "content": content,
                    "reasoning": _REPLY_REASON,
                    "priority": 85,
                    "status": "sent",
                    "expiresAt": expires_at,
                    "updatedAt": when.isoformat(),
                }
            )
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
            "windows": [w["label"] for w in windows],
            "picked": picked,
            "sent": True,
        }

    draft = {
        "id": str(uuid.uuid4()),
        "spaceId": space_id,
        "contactId": contact_id,
        "channel": "sms",
        "content": content,
        "reasoning": _REPLY_REASON,
        "priority": 85,
        "status": "sent",
        "expiresAt": expires_at,
    }
    result = await with_retry(lambda: db.table("AgentDraft").insert(draft).execute())
    created = result.data[0] if result.data else draft
    return {
        "action": "sent",
        "draftId": created.get("id", draft["id"]),
        "status": "sent",
        "channel": "sms",
        "content": content,
        "windows": [w["label"] for w in windows],
        "picked": picked,
        "sent": True,
    }
