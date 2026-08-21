"""First-touch SMS for inbound leads — autonomous-run backstop.

The TypeScript event trigger (`lib/agent/first-touch.ts`) drafts as soon as
a lead lands. This module does the same job when the autonomous run drains
the trigger queue, so a missed fire-time draft is filled here.

Never sends. Status is always pending. Two concrete showing windows.
Voice comes from the assigned workspace's AIUserProfile.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

INBOUND_LEAD_EVENTS = frozenset({"new_lead", "application_submitted"})
_DEDUPE_WINDOW_HOURS = 48

_TONE_MARKS = {
    "warm": ("this is", "which works"),
    "direct": ("i can hold",),
    "formal": ("would you prefer",),
    "casual": ("work for me",),
}


def is_inbound_lead_event(event: str | None) -> bool:
    return bool(event) and event in INBOUND_LEAD_EVENTS


def first_name_of(full: str | None, fallback: str = "there") -> str:
    part = (full or "").strip().split()
    return part[0] if part else fallback


def normalize_tone(raw: str | None) -> str:
    tone = (raw or "").strip().lower()
    if tone in {"warm", "direct", "formal", "casual"}:
        return tone
    return "warm"


def format_window_label(at: datetime) -> str:
    """Tue 11am — concrete, short enough for SMS."""
    weekday = at.strftime("%a")
    hour = at.hour
    minute = at.minute
    meridiem = "pm" if hour >= 12 else "am"
    hour12 = 12 if hour % 12 == 0 else hour % 12
    if minute == 0:
        return f"{weekday} {hour12}{meridiem}"
    return f"{weekday} {hour12}:{minute:02d}{meridiem}"


def propose_two_showing_windows(
    now: datetime,
    *,
    start_hour: int = 9,
    end_hour: int = 17,
    days_available: list[int] | None = None,
) -> list[dict[str, Any]]:
    """Next two business-hour slots, preferring 11am and 4pm on different days."""
    days = days_available or [1, 2, 3, 4, 5]
    last_open = max(start_hour, end_hour - 1)
    morning = min(max(start_hour, 11), last_open)
    afternoon = min(max(start_hour, 16), last_open)
    preferred = {morning, afternoon}

    cursor = (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    horizon = now + timedelta(days=14)
    preferred_hits: list[datetime] = []
    any_hits: list[datetime] = []
    while cursor < horizon and (len(preferred_hits) < 4 or len(any_hits) < 6):
        # SpaceSetting tourDaysAvailable uses JS getDay(): 0=Sun … 6=Sat.
        js_dow = (cursor.weekday() + 1) % 7
        if (
            js_dow in days
            and start_hour <= cursor.hour < end_hour
            and cursor > now + timedelta(minutes=45)
        ):
            any_hits.append(cursor)
            if cursor.hour in preferred:
                preferred_hits.append(cursor)
        cursor += timedelta(hours=1)

    picked = _pick_two([*preferred_hits, *any_hits])
    return [{"startsAt": dt, "label": format_window_label(dt)} for dt in picked]


def _pick_two(candidates: list[datetime]) -> list[datetime]:
    unique: list[datetime] = []
    seen: set[datetime] = set()
    for dt in candidates:
        if dt in seen:
            continue
        seen.add(dt)
        unique.append(dt)

    out: list[datetime] = []
    days: set[str] = set()
    for dt in unique:
        key = dt.date().isoformat()
        if not out or key not in days:
            out.append(dt)
            days.add(key)
        if len(out) == 2:
            return out
    for dt in unique:
        if dt not in out:
            out.append(dt)
        if len(out) == 2:
            return out
    return out


def compose_first_touch_sms(
    *,
    contact_first_name: str,
    agent_first_name: str,
    tone: str,
    windows: list[dict[str, Any]],
    property_name: str | None = None,
    business_name: str | None = None,
) -> str:
    if len(windows) < 2:
        raise ValueError("first-touch SMS requires two showing windows")
    lead = first_name_of(contact_first_name, "there")
    who = first_name_of(agent_first_name, "") or (business_name or "").strip() or "I"
    w1 = windows[0]["label"]
    w2 = windows[1]["label"]
    place = f"{property_name.strip()} is available. " if property_name and property_name.strip() else ""
    tone_key = normalize_tone(tone)

    if tone_key == "direct":
        text = f"Hi {lead} — {who} here. {place}I can hold {w1} or {w2}. Which works?"
    elif tone_key == "formal":
        with_biz = f" with {business_name}" if business_name else ""
        text = (
            f"Hello {lead}, this is {who}{with_biz}. {place}"
            f"I have {w1} or {w2} available. Which would you prefer?"
        )
    elif tone_key == "casual":
        opener = place or "want to come see the place? "
        text = f"Hey {lead}! {who} here — {opener}{w1} or {w2} work for me."
    else:
        text = f"Hey {lead}, this is {who}. {place}I can do {w1} or {w2} — which works?"

    content = " ".join(text.split()).strip()
    assert_valid_first_touch_text(content, windows=[w1, w2], agent_token=who, tone=tone_key)
    return content


def assert_valid_first_touch_text(
    content: str,
    *,
    windows: list[str],
    agent_token: str,
    tone: str,
) -> None:
    if not content.strip():
        raise ValueError("first-touch draft is empty")
    for window in windows:
        if window not in content:
            raise ValueError(f"first-touch draft missing showing window: {window}")
    if agent_token and agent_token not in content:
        raise ValueError("first-touch draft is not in the assigned agent voice")
    if "chippy" in content.lower():
        raise ValueError("first-touch draft used the wrong brand spelling")
    lower = content.lower()
    if any(word in lower for word in ("sent", "delivered", "auto-sent", "autosent")):
        raise ValueError("first-touch draft claims it was sent")
    marks = _TONE_MARKS[normalize_tone(tone)]
    if not any(mark in lower for mark in marks):
        raise ValueError(f"first-touch draft is not in the {tone} voice")


def first_touch_instruction(triggers: list[dict]) -> str | None:
    """Extra opening-prompt block for inbound-lead triggers."""
    inbound = [
        t
        for t in triggers
        if is_inbound_lead_event(t.get("event")) and t.get("contactId")
    ]
    if not inbound:
        return None
    lines = []
    for t in inbound:
        lines.append(f"- {t.get('event')} contactId: {t['contactId']}")
    return (
        "FIRST TOUCH — a new inbound lead just arrived. Draft one short SMS "
        "in the assigned realtor's voice with two concrete showing windows. "
        "Park it as a pending AgentDraft. Never send.\n" + "\n".join(lines)
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


async def ensure_first_touch_draft(
    space_id: str,
    contact_id: str,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Create or fill a pending first-touch SMS. Never sends."""
    from db import supabase
    from tools.base import with_retry

    when = now or datetime.now(timezone.utc)
    db = await supabase()

    check = await (
        db.table("Contact")
        .select("id,name,address,properties,applicationData")
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )
    if not check.data:
        return {"error": "Contact not found in space", "sent": False}

    contact = check.data
    cutoff = (when - timedelta(hours=_DEDUPE_WINDOW_HOURS)).isoformat()
    existing = await (
        db.table("AgentDraft")
        .select("id,content,status,channel")
        .eq("spaceId", space_id)
        .eq("contactId", contact_id)
        .eq("channel", "sms")
        .eq("status", "pending")
        .gte("createdAt", cutoff)
        .order("createdAt", desc=True)
        .limit(1)
        .execute()
    )
    prior = existing.data[0] if existing.data else None
    if prior and (prior.get("content") or "").strip():
        return {
            "action": "deduped",
            "draftId": prior["id"],
            "status": "pending",
            "channel": "sms",
            "content": prior["content"],
            "sent": False,
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

    windows = propose_two_showing_windows(
        when,
        start_hour=setting.get("tourStartHour") or 9,
        end_hour=setting.get("tourEndHour") or 17,
        days_available=setting.get("tourDaysAvailable") or None,
    )
    if len(windows) < 2:
        return {"error": "could not propose two showing windows", "sent": False}

    content = compose_first_touch_sms(
        contact_first_name=first_name_of(contact.get("name"), "there"),
        agent_first_name=agent_name,
        tone=normalize_tone(profile.get("communicationTone")),
        windows=windows,
        property_name=_property_from_contact(contact),
        business_name=business,
    )

    expires_at = (when + timedelta(days=7)).isoformat()
    if prior and not (prior.get("content") or "").strip():
        await with_retry(
            lambda: db.table("AgentDraft")
            .update(
                {
                    "content": content,
                    "reasoning": (
                        "First-touch SMS for a new inbound lead — two showing "
                        "windows, awaiting approval. Never sent."
                    ),
                    "priority": 80,
                    "status": "pending",
                    "expiresAt": expires_at,
                    "updatedAt": when.isoformat(),
                }
            )
            .eq("id", prior["id"])
            .eq("spaceId", space_id)
            .execute()
        )
        return {
            "action": "filled",
            "draftId": prior["id"],
            "status": "pending",
            "channel": "sms",
            "content": content,
            "windows": [w["label"] for w in windows],
            "sent": False,
        }

    draft = {
        "id": str(uuid.uuid4()),
        "spaceId": space_id,
        "contactId": contact_id,
        "channel": "sms",
        "content": content,
        "reasoning": (
            "First-touch SMS for a new inbound lead — two showing windows, "
            "awaiting approval. Never sent."
        ),
        "priority": 80,
        "status": "pending",
        "expiresAt": expires_at,
    }
    result = await with_retry(lambda: db.table("AgentDraft").insert(draft).execute())
    created = result.data[0] if result.data else draft
    return {
        "action": "drafted",
        "draftId": created.get("id", draft["id"]),
        "status": "pending",
        "channel": "sms",
        "content": content,
        "windows": [w["label"] for w in windows],
        "sent": False,
    }
