"""Tour booking tool — agent creates a Tour row for a contact.

The realtor connects Google Calendar separately; this tool just creates
the canonical Tour record. If the space has a GoogleCalendarToken on file
the existing API path will pick it up and create the calendar event from
that point — that's not Chippi's job.

Tenant boundary: spaceId from RunContextWrapper, never an argument.
Contact must belong to the space.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext
from tools.activities import persist_log
from tools.base import idempotent_tool
from tools.streaming import publish_event


def _parse_iso(value: str) -> datetime | None:
    try:
        # Accept both 'Z' and explicit offsets
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


@function_tool
@idempotent_tool
async def book_tour(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    starts_at: str,
    duration_minutes: int = 30,
    property_address: str | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    """Book a tour for a contact at a specific time.

    contact_id: must belong to this workspace.
    starts_at: ISO 8601 datetime, e.g. '2026-05-04T14:00:00-07:00' or
      '2026-05-04T21:00:00Z'. Be explicit about timezone — naive datetimes
      are treated as UTC.
    duration_minutes: 5-240 (default 30).
    property_address: free-text address of the property being toured.
      Optional — sometimes set later when the realtor confirms.
    notes: anything else worth attaching to the tour record.

    Logs a ContactActivity entry so the realtor sees the booking in the
    contact's timeline.

    Returns: { ok, tourId, startsAt, endsAt, contactId } on success.
    """
    space_id = ctx.context.space_id
    db = await supabase()

    # Validate contact + pull canonical name/email/phone for the Tour row.
    check = await (
        db.table("Contact")
        .select("id,name,email,phone")
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )
    if not check.data:
        return {"error": "Contact not found in space"}
    contact = check.data

    starts = _parse_iso(starts_at)
    if starts is None:
        return {"error": "starts_at must be ISO 8601 (e.g. 2026-05-04T14:00:00-07:00)"}
    if starts.tzinfo is None:
        starts = starts.replace(tzinfo=timezone.utc)

    duration = max(5, min(240, int(duration_minutes or 30)))
    ends = starts + timedelta(minutes=duration)

    if starts < datetime.now(timezone.utc) - timedelta(minutes=5):
        return {"error": "starts_at is in the past — pick a future time"}

    guest_name = contact.get("name") or "Guest"
    guest_email = contact.get("email") or ""
    if not guest_email:
        return {"error": "Contact has no email on file — add one before booking"}
    guest_phone = contact.get("phone") or None

    tour_id = str(uuid.uuid4())
    tour_row = {
        "id": tour_id,
        "spaceId": space_id,
        "contactId": contact_id,
        "guestName": guest_name,
        "guestEmail": guest_email,
        "guestPhone": guest_phone,
        "propertyAddress": property_address,
        "notes": notes,
        "startsAt": starts.isoformat(),
        "endsAt": ends.isoformat(),
        "status": "scheduled",
    }

    try:
        result = await db.table("Tour").insert(tour_row).execute()
    except Exception as exc:  # surface DB error to the agent
        return {"error": f"tour insert failed: {exc}"}

    # Activity timeline entry for the contact
    summary_addr = f" at {property_address}" if property_address else ""
    await db.table("ContactActivity").insert({
        "id": str(uuid.uuid4()),
        "contactId": contact_id,
        "spaceId": space_id,
        "type": "note",
        "content": (
            f"[Agent] Tour booked for "
            f"{starts.strftime('%a %b %d, %I:%M%p').replace(' 0', ' ')}"
            f"{summary_addr}. {(notes or '').strip()[:200]}"
        ).strip(),
        "metadata": {
            "source": "agent",
            "agentRunId": ctx.context.run_id,
            "tourId": tour_id,
        },
    }).execute()

    await publish_event(
        ctx.context,
        "action",
        f"Tour booked for {guest_name} — {starts.strftime('%b %d, %I:%M%p')}",
        agent_type=ctx.context.current_agent_type,
        metadata={"contactId": contact_id, "tourId": tour_id},
    )

    # Audit trail for broker rollup
    try:
        await persist_log(
            ctx.context,
            action_type="tour_booked",
            outcome="completed",
            reasoning=f"Tour at {property_address or 'TBD'} on {starts.isoformat()}",
            contact_id=contact_id,
        )
    except Exception:
        pass

    created = result.data[0] if result.data else tour_row
    return {
        "ok": True,
        "tourId": created.get("id", tour_id),
        "startsAt": starts.isoformat(),
        "endsAt": ends.isoformat(),
        "contactId": contact_id,
    }
