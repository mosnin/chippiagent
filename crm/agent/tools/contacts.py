"""Contact tools — find, update, activity. spaceId always from AgentContext."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from agents import RunContextWrapper, function_tool

from db import supabase
from errors import from_supabase_error, from_exception
from memory.store import save_memory
from security.context import AgentContext
from tools.base import idempotent_tool, with_retry
from tools.streaming import publish_event

_CLIP = 300


def _trim(value: Any, max_chars: int = _CLIP) -> Any:
    if isinstance(value, str) and len(value) > max_chars:
        return value[:max_chars - 1] + "…"
    return value


@function_tool
async def find_contacts(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str | None = None,
    name_contains: str | None = None,
    lead_type: str | None = None,
    overdue_followup_only: bool = False,
    no_followup_quiet_days: int | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Find contacts in this space. One tool, many filters.

    contact_id: return that one contact (returns [] if not found / cross-space).
    name_contains: case-insensitive substring match on name.
    lead_type: 'rental' | 'buyer'.
    overdue_followup_only: True → only contacts with followUpAt in the past.
    no_followup_quiet_days: e.g. 7 → contacts with no follow-up scheduled who
      haven't been contacted in 7+ days. Used for the autonomous sweep.
    limit: cap on results (1-100).

    When contact_id is set, full record is returned (notes, scoreSummary,
    preferences). Otherwise a slimmer list view is returned.
    """
    space_id = ctx.context.space_id
    db = await supabase()
    limit = max(1, min(100, limit))

    if contact_id:
        result = await (
            db.table("Contact")
            .select(
                "id,name,email,phone,leadType,leadScore,scoreLabel,scoringStatus,"
                "scoreSummary,followUpAt,lastContactedAt,type,tags,status,"
                "budget,preferences,notes,createdAt,updatedAt"
            )
            .eq("id", contact_id)
            .eq("spaceId", space_id)
            .maybe_single()
            .execute()
        )
        if not result.data:
            return []
        row = result.data
        for field in ("scoreSummary", "preferences", "notes"):
            if field in row:
                row[field] = _trim(row[field])
        return [row]

    query = (
        db.table("Contact")
        .select(
            "id,name,email,phone,leadType,leadScore,scoreLabel,followUpAt,"
            "lastContactedAt,type,tags,createdAt"
        )
        .eq("spaceId", space_id)
        .order("createdAt", desc=True)
        .limit(limit)
    )

    if lead_type:
        query = query.eq("leadType", lead_type)

    if name_contains:
        query = query.ilike("name", f"%{name_contains.strip()}%")

    if overdue_followup_only:
        now_iso = datetime.now(timezone.utc).isoformat()
        query = query.lte("followUpAt", now_iso).not_.is_("followUpAt", "null")

    if no_followup_quiet_days is not None and no_followup_quiet_days > 0:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=no_followup_quiet_days)).isoformat()
        query = (
            query.eq("type", "QUALIFICATION")
            .is_("followUpAt", "null")
            .or_(f"lastContactedAt.lt.{cutoff},lastContactedAt.is.null")
        )

    result = await query.execute()
    return result.data or []


@function_tool
async def get_contact_activity(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Most recent activity entries for a contact."""
    space_id = ctx.context.space_id
    db = await supabase()

    result = await (
        db.table("ContactActivity")
        .select("id,type,content,createdAt")
        .eq("contactId", contact_id)
        .eq("spaceId", space_id)
        .order("createdAt", desc=True)
        .limit(limit)
        .execute()
    )
    rows = result.data or []
    for row in rows:
        row["content"] = _trim(row.get("content"))
    return rows


@function_tool
@idempotent_tool
async def create_contact(
    ctx: RunContextWrapper[AgentContext],
    name: str,
    lead_type: str = "buyer",
    email: str | None = None,
    phone: str | None = None,
    budget: float | None = None,
    preferences: str | None = None,
    notes: str | None = None,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    """Create a new contact (person) in the workspace.

    name: full name. Required.
    lead_type: 'buyer' | 'rental' | 'seller'. Default 'buyer'.
    email: email address if known.
    phone: phone number in any format.
    budget: dollars. For rentals this is monthly; for buyers, purchase price.
    preferences: free-form — neighborhood, bedrooms, must-haves, etc.
    notes: any initial notes stored verbatim on the contact record.
    tags: optional labels. Use 'new-lead' for fresh leads.

    Use when the realtor says "add a lead", "log a new contact", "create a
    person", etc. Never store in memory when you can create the actual record.
    """
    space_id = ctx.context.space_id
    db = await supabase()
    now = datetime.now(timezone.utc).isoformat()

    clean_name = name.strip()[:200] if name else ""
    if not clean_name:
        return {"error": "name is required"}

    valid_lead_types = {"buyer", "rental", "seller"}
    clean_lead_type = lead_type.strip().lower() if lead_type else "buyer"
    if clean_lead_type not in valid_lead_types:
        clean_lead_type = "buyer"

    clean_tags = [t.strip()[:60] for t in (tags or []) if t.strip()][:10]

    import uuid as _uuid
    contact_id = str(_uuid.uuid4())

    row: dict[str, Any] = {
        "id": contact_id,
        "spaceId": space_id,
        "name": clean_name,
        "leadType": clean_lead_type,
        "type": "QUALIFICATION",
        "properties": [],
        "tags": clean_tags,
        "createdAt": now,
        "updatedAt": now,
    }
    if email:
        row["email"] = email.strip()[:320]
    if phone:
        row["phone"] = phone.strip()[:40]
    if budget is not None and budget >= 0:
        row["budget"] = budget
    if preferences:
        row["preferences"] = preferences.strip()[:2000]
    if notes:
        row["notes"] = notes.strip()[:5000]

    try:
        await db.table("Contact").insert(row).execute()
    except Exception as e:
        agent_err = from_exception(e)
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}

    # Activity log for the creation event
    try:
        await db.table("ContactActivity").insert({
            "id": str(_uuid.uuid4()),
            "contactId": contact_id,
            "spaceId": space_id,
            "type": "note",
            "content": f"[Agent] Contact created: {clean_name}",
            "metadata": {"source": "agent", "agentRunId": ctx.context.run_id},
        }).execute()
    except Exception:
        pass

    await publish_event(
        ctx.context,
        "action",
        f"Created contact {clean_name}",
        agent_type=ctx.context.current_agent_type,
        metadata={"contactId": contact_id},
    )

    return {
        "ok": True,
        "contactId": contact_id,
        "name": clean_name,
        "leadType": clean_lead_type,
    }


_VALID_TYPES = {"QUALIFICATION", "TOUR", "APPLICATION"}


@function_tool
@idempotent_tool
async def update_contact(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    reason: str,
    add_tags: list[str] | None = None,
    new_pipeline_type: str | None = None,
    follow_up_date: str | None = None,
    brief: str | None = None,
    score_explanation: str | None = None,
    re_engaged_signal: str | None = None,
) -> dict[str, Any]:
    """Update a contact. Pass only the fields you want to change.

    add_tags: up to 5 tags to merge into existing tags.
    new_pipeline_type: 'QUALIFICATION' | 'TOUR' | 'APPLICATION' (logs activity).
    follow_up_date: ISO date string (e.g. '2026-04-25') to schedule a follow-up.
    brief: 2-3 sentence agent summary stored as a high-importance memory.
    score_explanation: plain-English reason for the contact's current lead score.
    re_engaged_signal: short string like 'replied to SMS' — boosts lead score
      by ~12 points and logs the re-engagement.

    reason: required short string explaining why the change is being made;
    surfaces in the activity log so the realtor can audit.
    """
    space_id = ctx.context.space_id
    db = await supabase()
    now = datetime.now(timezone.utc).isoformat()

    check = await (
        db.table("Contact")
        .select("id,name,type,tags,leadScore")
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )
    if not check.data:
        agent_err = from_supabase_error({"message": "Contact not found in space", "code": None})
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}
    contact = check.data
    contact_name = contact.get("name", "contact")

    update: dict[str, Any] = {}
    activities: list[dict[str, Any]] = []
    summary_parts: list[str] = []

    # ── Tags ──
    if add_tags:
        clean_tags = [t.strip()[:60] for t in add_tags[:5] if t.strip()]
        if clean_tags:
            existing = contact.get("tags") or []
            merged = list(dict.fromkeys(existing + clean_tags))
            update["tags"] = merged
            activities.append({
                "type": "note",
                "content": f"[Agent] Tags added: {', '.join(clean_tags)}. {reason}",
                "metadata": {"source": "agent", "addedTags": clean_tags},
            })
            summary_parts.append(f"tagged {clean_tags}")

    # ── Pipeline type ──
    if new_pipeline_type:
        if new_pipeline_type not in _VALID_TYPES:
            agent_err = from_supabase_error({"message": f"new_pipeline_type must be one of {_VALID_TYPES}", "code": None})
            return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}
        old_type = contact.get("type", "QUALIFICATION")
        if old_type != new_pipeline_type:
            update["type"] = new_pipeline_type
            update["stageChangedAt"] = now
            activities.append({
                "type": "note",
                "content": f"[Agent] Pipeline stage updated: {old_type} → {new_pipeline_type}. {reason}",
                "metadata": {"source": "agent", "oldType": old_type, "newType": new_pipeline_type},
            })
            summary_parts.append(f"{old_type}→{new_pipeline_type}")

    # ── Follow-up ──
    if follow_up_date:
        update["followUpAt"] = follow_up_date
        activities.append({
            "type": "follow_up",
            "content": f"[Agent] Follow-up scheduled: {reason}",
            "metadata": {"source": "agent", "followUpDate": follow_up_date},
        })
        summary_parts.append(f"follow-up {follow_up_date}")

    # ── Re-engagement boost ──
    if re_engaged_signal:
        current_score = contact.get("leadScore") or 40
        new_score = min(100, current_score + 12)
        update["leadScore"] = new_score
        activities.append({
            "type": "note",
            "content": f"[Agent] Contact re-engaged: {re_engaged_signal}",
            "metadata": {"source": "agent", "signal": re_engaged_signal},
        })
        summary_parts.append(f"re-engaged (+{new_score - current_score})")

    if update:
        update["updatedAt"] = now
        try:
            await with_retry(
                lambda: db.table("Contact")
                .update(update)
                .eq("id", contact_id)
                .eq("spaceId", space_id)
                .execute()
            )
        except Exception as e:
            agent_err = from_exception(e)
            return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}

    # ── Brief / score explanation → high-importance memory (no DB column) ──
    if brief:
        clean_brief = brief.strip()[:800]
        if len(clean_brief) >= 20:
            await save_memory(
                space_id=space_id,
                entity_type="contact",
                entity_id=contact_id,
                memory_type="observation",
                content=f"AGENT_BRIEF:{clean_brief}",
                importance=0.8,
            )
            summary_parts.append("brief")

    if score_explanation:
        clean_expl = score_explanation.strip()[:500]
        if len(clean_expl) >= 10:
            score_val = update.get("leadScore", contact.get("leadScore") or 0)
            await save_memory(
                space_id=space_id,
                entity_type="contact",
                entity_id=contact_id,
                memory_type="fact",
                content=f"SCORE_EXPLANATION:{score_val}:{clean_expl}",
                importance=0.7,
            )
            summary_parts.append("score-expl")

    # ── Activity log ──
    # The Contact update above already committed. Activity rows are a
    # best-effort audit trail — a failed insert must not report the whole
    # tool as failed, or the model retries an update that already succeeded.
    for act in activities:
        try:
            await db.table("ContactActivity").insert({
                "id": str(uuid.uuid4()),
                "contactId": contact_id,
                "spaceId": space_id,
                "type": act["type"],
                "content": act["content"],
                "metadata": {**act["metadata"], "agentRunId": ctx.context.run_id},
            }).execute()
        except Exception:
            pass

    if summary_parts:
        await publish_event(
            ctx.context,
            "action",
            f"Updated {contact_name}: " + ", ".join(summary_parts),
            agent_type=ctx.context.current_agent_type,
            metadata={"contactId": contact_id},
        )

    return {"ok": True, "contactId": contact_id, "changes": summary_parts or ["no-op"]}
