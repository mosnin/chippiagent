"""Property tools — add a property, share a packet with a contact.

Tenant boundary: spaceId is taken from RunContextWrapper, never from LLM
arguments. Same pattern as every other write tool in this package.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from config import settings
from db import supabase
from security.context import AgentContext
from tools.activities import persist_log
from tools.base import idempotent_tool
from tools.streaming import publish_event

_ALLOWED_PROPERTY_TYPES = {
    "single_family",
    "condo",
    "townhouse",
    "multi_family",
    "land",
    "commercial",
    "other",
}

_ALLOWED_LISTING_STATUS = {
    "active",
    "pending",
    "sold",
    "off_market",
    "owned",
}


@function_tool
@idempotent_tool
async def add_property(
    ctx: RunContextWrapper[AgentContext],
    address: str,
    list_price: float | None = None,
    property_type: str | None = None,
    listing_status: str | None = None,
    beds: int | None = None,
    baths: float | None = None,
    square_feet: int | None = None,
    mls_number: str | None = None,
    listing_url: str | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    """Add a property to the realtor's inventory.

    Use this when the realtor asks to add a listing, register a property
    they're working on, or save an address for later use. The property
    can later be linked to deals and tour bookings.

    Required: address.
    Optional everything else — capture what the realtor mentions, leave
    the rest null. Don't ask follow-up questions just to fill the form.

    list_price is in dollars (number). $850,000 → 850000.

    property_type, when provided, must be one of: 'single_family',
    'condo', 'townhouse', 'multi_family', 'land', 'commercial', 'other'.

    listing_status, when provided, must be one of: 'active', 'pending',
    'sold', 'off_market', 'owned'. Defaults to 'active' if omitted.

    Returns {id, address, list_price, listing_status} on success, or
    {error: "..."} on validation/insert failure.
    """
    space_id = ctx.context.space_id
    db = await supabase()

    address_clean = (address or "").strip()
    if not address_clean:
        return {"error": "address is required"}
    if len(address_clean) > 500:
        return {"error": "address must be 500 characters or fewer"}

    if list_price is not None and (not isinstance(list_price, (int, float)) or list_price < 0):
        return {"error": "list_price must be a non-negative number"}

    if property_type is not None and property_type not in _ALLOWED_PROPERTY_TYPES:
        return {
            "error": "property_type must be one of: " + ", ".join(sorted(_ALLOWED_PROPERTY_TYPES)),
        }

    status = listing_status or "active"
    if status not in _ALLOWED_LISTING_STATUS:
        return {
            "error": "listing_status must be one of: " + ", ".join(sorted(_ALLOWED_LISTING_STATUS)),
        }

    property_id = str(uuid.uuid4())
    row = {
        "id": property_id,
        "spaceId": space_id,
        "address": address_clean,
        "listPrice": list_price,
        "propertyType": property_type,
        "listingStatus": status,
        "beds": beds,
        "baths": baths,
        "squareFeet": square_feet,
        "mlsNumber": mls_number,
        "listingUrl": listing_url,
        "notes": notes,
    }

    try:
        result = await db.table("Property").insert(row).execute()
    except Exception as exc:  # noqa: BLE001 — surface DB error to the agent
        return {"error": f"insert failed: {exc}"}

    if not result.data:
        return {"error": "insert returned no row"}

    return {
        "id": property_id,
        "address": address_clean,
        "list_price": list_price,
        "listing_status": status,
    }


@function_tool
@idempotent_tool
async def send_property_packet(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    reasoning: str,
    packet_id: str | None = None,
    property_id: str | None = None,
    channel: str = "email",
    subject: str | None = None,
    intro_message: str | None = None,
) -> dict[str, Any]:
    """Send a property packet to a contact — drafts a message with the
    shareable packet URL pre-filled.

    Pass exactly one of:
      packet_id — an existing PropertyPacket in this workspace.
      property_id — a Property in this workspace; the most recently
                    created non-revoked packet for that property is
                    auto-selected.

    channel: 'email' (default) | 'sms' | 'note'.
    subject: required when channel='email'.
    intro_message: optional 1-2 sentence intro that goes before the link
                   ("Hi Sarah, here's the packet for the Westwood unit
                   we toured Tuesday.").

    The tool creates a pending AgentDraft (same auto-dedup window as
    draft_message). Surfaces draft id so the realtor can find it.

    Returns: { ok, draftId, packetId, packetUrl, contactId } on success.
    """
    if not packet_id and not property_id:
        return {"error": "Pass packet_id or property_id"}
    if channel not in {"email", "sms", "note"}:
        return {"error": "channel must be 'email' | 'sms' | 'note'"}
    if channel == "email" and not subject:
        return {"error": "subject is required for email channel"}

    space_id = ctx.context.space_id
    db = await supabase()

    # Validate contact in space
    contact_check = await (
        db.table("Contact")
        .select("id,name")
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )
    if not contact_check.data:
        return {"error": "Contact not found in space"}
    contact_name = contact_check.data.get("name") or "contact"

    # Resolve packet
    packet: dict[str, Any] | None = None
    if packet_id:
        pkt = await (
            db.table("PropertyPacket")
            .select("id,name,token,propertyId,expiresAt,revokedAt")
            .eq("id", packet_id)
            .eq("spaceId", space_id)
            .maybe_single()
            .execute()
        )
        if not pkt.data:
            return {"error": "PropertyPacket not found in space"}
        packet = pkt.data
    else:
        prop = await (
            db.table("Property")
            .select("id,address")
            .eq("id", property_id)
            .eq("spaceId", space_id)
            .maybe_single()
            .execute()
        )
        if not prop.data:
            return {"error": "Property not found in space"}
        pkts = await (
            db.table("PropertyPacket")
            .select("id,name,token,propertyId,expiresAt,revokedAt")
            .eq("spaceId", space_id)
            .eq("propertyId", property_id)
            .is_("revokedAt", None)
            .order("createdAt", desc=True)
            .limit(1)
            .execute()
        )
        if not pkts.data:
            return {"error": (
                f"No packet exists for that property. Create a packet first "
                f"in the Property page, then call this tool with the packet_id."
            )}
        packet = pkts.data[0]

    # Reject revoked / expired
    if packet.get("revokedAt"):
        return {"error": "Packet has been revoked"}
    expires_at = packet.get("expiresAt")
    if expires_at:
        try:
            exp = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
            if exp < datetime.now(timezone.utc):
                return {"error": "Packet has expired — create a fresh one"}
        except (ValueError, TypeError):
            pass

    base_url = (settings.app_url or "").rstrip("/")
    if not base_url:
        return {"error": "NEXT_PUBLIC_APP_URL is not configured — cannot build packet URL"}
    packet_url = f"{base_url}/packet/{packet['token']}"

    # Build the draft body
    intro = (intro_message or "").strip()
    if intro:
        if channel == "sms":
            body = f"{intro} {packet_url}"
        elif channel == "email":
            body = f"{intro}\n\n{packet_url}"
        else:
            body = f"{intro}\n\nPacket: {packet_url}"
    else:
        body = packet_url if channel != "note" else f"Packet: {packet_url}"

    # Draft via the same dedup window draft_message uses
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
    existing = await (
        db.table("AgentDraft")
        .select("id")
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
        return {
            "ok": True,
            "action": "deduped",
            "draftId": existing.data[0]["id"],
            "packetId": packet["id"],
            "packetUrl": packet_url,
            "contactId": contact_id,
            "note": "A pending draft for this contact already exists from the last 48h.",
        }

    draft_id = str(uuid.uuid4())
    draft = {
        "id": draft_id,
        "spaceId": space_id,
        "contactId": contact_id,
        "channel": channel,
        "subject": subject,
        "content": body,
        "reasoning": reasoning,
        "priority": 0,
        "status": "pending",
        "expiresAt": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
    }

    try:
        await db.table("AgentDraft").insert(draft).execute()
    except Exception as exc:
        return {"error": f"draft insert failed: {exc}"}

    await publish_event(
        ctx.context,
        "draft",
        f"Packet drafted for {contact_name} — awaiting your approval",
        metadata={"contactId": contact_id, "packetId": packet["id"], "channel": channel},
    )

    try:
        await persist_log(
            ctx.context,
            action_type="packet_drafted",
            outcome="queued_for_approval",
            reasoning=f"Sent packet '{packet.get('name', '')[:60]}' via {channel}. {reasoning[:200]}",
            contact_id=contact_id,
        )
    except Exception:
        pass

    return {
        "ok": True,
        "action": "drafted",
        "draftId": draft_id,
        "packetId": packet["id"],
        "packetUrl": packet_url,
        "contactId": contact_id,
        "channel": channel,
    }
