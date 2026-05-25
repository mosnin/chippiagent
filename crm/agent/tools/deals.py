"""Deal tools — find and update. spaceId always from AgentContext."""

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

_CLIP = 300


def _trim(value: Any, max_chars: int = _CLIP) -> Any:
    if isinstance(value, str) and len(value) > max_chars:
        return value[:max_chars - 1] + "…"
    return value


@function_tool
async def find_deals(
    ctx: RunContextWrapper[AgentContext],
    deal_id: str | None = None,
    status: str = "active",
    stalled_days: int | None = None,
    closing_within_days: int | None = None,
    limit: int = 30,
) -> list[dict[str, Any]]:
    """Find deals in this space. One tool, many filters.

    deal_id: return that one deal (returns [] if not found / cross-space).
    status: 'active' | 'won' | 'lost' | 'on_hold' (default 'active').
    stalled_days: e.g. 14 → only deals not updated in 14+ days.
    closing_within_days: e.g. 14 → only deals with closeDate in the next 14 days.
    limit: 1-50.
    """
    space_id = ctx.context.space_id
    db = await supabase()
    limit = max(1, min(50, limit))

    if deal_id:
        result = await (
            db.table("Deal")
            .select(
                "id,title,value,status,priority,closeDate,stageId,probability,"
                "commissionRate,followUpAt,address,description,createdAt,updatedAt"
            )
            .eq("id", deal_id)
            .eq("spaceId", space_id)
            .maybe_single()
            .execute()
        )
        if not result.data:
            return []
        row = result.data
        row["description"] = _trim(row.get("description"))
        row["address"] = _trim(row.get("address"))
        return [row]

    query = (
        db.table("Deal")
        .select(
            "id,title,value,status,priority,closeDate,stageId,probability,"
            "commissionRate,followUpAt,createdAt,updatedAt"
        )
        .eq("spaceId", space_id)
        .eq("status", status)
        .limit(limit)
    )

    now = datetime.now(timezone.utc)

    if stalled_days is not None and stalled_days > 0:
        cutoff = (now - timedelta(days=stalled_days)).isoformat()
        query = query.lte("updatedAt", cutoff).order("updatedAt")
    elif closing_within_days is not None and closing_within_days > 0:
        today = now.date().isoformat()
        ahead = (now + timedelta(days=closing_within_days)).date().isoformat()
        query = (
            query.lte("closeDate", ahead)
            .gte("closeDate", today)
            .not_.is_("closeDate", "null")
            .order("closeDate")
        )
    else:
        query = query.order("createdAt", desc=True)

    result = await query.execute()
    return result.data or []


@function_tool
@idempotent_tool
async def update_deal(
    ctx: RunContextWrapper[AgentContext],
    deal_id: str,
    reason: str,
    probability: int | None = None,
    follow_up_date: str | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    """Update a deal. Pass only the fields you want to change.

    probability: 0–100 close probability.
    follow_up_date: ISO date string for next follow-up.
    note: short agent note (<1000 chars) prepended to deal description with date.
    reason: required short string; logged on the activity row.
    """
    space_id = ctx.context.space_id
    db = await supabase()
    now = datetime.now(timezone.utc).isoformat()

    check = await (
        db.table("Deal")
        .select("id,title,probability,description")
        .eq("id", deal_id)
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )
    if not check.data:
        agent_err = from_supabase_error({"message": "Deal not found in space", "code": None})
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}
    deal = check.data
    deal_title = deal.get("title") or deal_id[:8]

    update: dict[str, Any] = {}
    activities: list[dict[str, Any]] = []
    summary_parts: list[str] = []

    if probability is not None:
        if not (0 <= probability <= 100):
            agent_err = from_supabase_error({"message": "probability must be between 0 and 100", "code": None})
            return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}
        old_prob = deal.get("probability")
        if old_prob != probability:
            update["probability"] = probability
            from_str = f"{old_prob}%" if old_prob is not None else "—"
            activities.append({
                "type": "note",
                "content": f"[Agent] Probability {from_str} → {probability}%. {reason}",
                "metadata": {"source": "agent", "oldProbability": old_prob, "newProbability": probability},
            })
            summary_parts.append(f"prob {probability}%")

    if follow_up_date:
        update["followUpAt"] = follow_up_date
        activities.append({
            "type": "follow_up",
            "content": f"[Agent] Follow-up scheduled: {reason}",
            "metadata": {"source": "agent", "followUpDate": follow_up_date},
        })
        summary_parts.append(f"follow-up {follow_up_date}")

    if note:
        if len(note) > 1000:
            agent_err = from_supabase_error({"message": "note must be under 1000 characters", "code": None})
            return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        prefix = f"[Agent {date_str}] {note}\n\n"
        existing = deal.get("description") or ""
        update["description"] = (prefix + existing).strip()[:5000]
        summary_parts.append("note")

    if update:
        update["updatedAt"] = now
        try:
            await with_retry(
                lambda: db.table("Deal")
                .update(update)
                .eq("id", deal_id)
                .eq("spaceId", space_id)
                .execute()
            )
        except Exception as e:
            agent_err = from_exception(e)
            return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}

    # The Deal update above already committed. Activity rows are a
    # best-effort audit trail — a failed insert must not fail the tool.
    for act in activities:
        try:
            await db.table("DealActivity").insert({
                "id": str(uuid.uuid4()),
                "dealId": deal_id,
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
            f"Updated deal '{deal_title}': " + ", ".join(summary_parts),
            agent_type=ctx.context.current_agent_type,
            metadata={"dealId": deal_id},
        )

    return {"ok": True, "dealId": deal_id, "changes": summary_parts or ["no-op"]}


@function_tool
@idempotent_tool
async def advance_deal_stage(
    ctx: RunContextWrapper[AgentContext],
    deal_id: str,
    reason: str,
    target_stage_name: str | None = None,
    target_stage_id: str | None = None,
    new_probability: int | None = None,
) -> dict[str, Any]:
    """Move a deal to a different stage in the workspace pipeline.

    Pass exactly one of:
      target_stage_name — case-insensitive match on a DealStage in this
                          workspace, e.g. "Under Contract", "Closed Won".
      target_stage_id   — when you already have the stage id.

    Optional:
      new_probability — 0-100. Set when the stage move warrants a
                        probability change (e.g. "Under Contract" → 80).

    reason: required short string; logs a DealActivity row so the realtor
    can audit who moved the deal and why.
    """
    if not target_stage_name and not target_stage_id:
        agent_err = from_supabase_error({"message": "Pass either target_stage_name or target_stage_id", "code": None})
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}
    if new_probability is not None and not (0 <= new_probability <= 100):
        agent_err = from_supabase_error({"message": "new_probability must be 0-100", "code": None})
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}

    space_id = ctx.context.space_id
    db = await supabase()
    now = datetime.now(timezone.utc).isoformat()

    deal_check = await (
        db.table("Deal")
        .select("id,title,stageId,probability")
        .eq("id", deal_id)
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )
    if not deal_check.data:
        agent_err = from_supabase_error({"message": "Deal not found in space", "code": None})
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}
    deal = deal_check.data
    deal_title = deal.get("title") or deal_id[:8]

    # Resolve the target stage in this workspace
    if target_stage_id:
        stage_check = await (
            db.table("DealStage")
            .select("id,name")
            .eq("id", target_stage_id)
            .eq("spaceId", space_id)
            .maybe_single()
            .execute()
        )
    else:
        # Case-insensitive match by name
        stages_res = await (
            db.table("DealStage")
            .select("id,name")
            .eq("spaceId", space_id)
            .ilike("name", target_stage_name or "")
            .limit(1)
            .execute()
        )
        stage_check = type("R", (), {"data": (stages_res.data[0] if stages_res.data else None)})

    if not stage_check.data:
        agent_err = from_supabase_error({"message": "Target stage not found in workspace pipeline", "code": None})
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}

    new_stage_id = stage_check.data["id"]
    new_stage_name = stage_check.data["name"]

    if deal.get("stageId") == new_stage_id and new_probability is None:
        return {"ok": True, "unchanged": True, "stage": new_stage_name}

    update: dict[str, Any] = {"stageId": new_stage_id, "updatedAt": now}
    if new_probability is not None:
        update["probability"] = new_probability

    try:
        await (
            db.table("Deal")
            .update(update)
            .eq("id", deal_id)
            .eq("spaceId", space_id)
            .execute()
        )
    except Exception as e:
        agent_err = from_exception(e)
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}

    activity_content = f"[Agent] Stage → {new_stage_name}. {reason}"
    if new_probability is not None:
        activity_content += f" (probability {new_probability}%)"

    try:
        await db.table("DealActivity").insert({
            "id": str(uuid.uuid4()),
            "dealId": deal_id,
            "spaceId": space_id,
            "type": "note",
            "content": activity_content,
            "metadata": {
                "source": "agent",
                "agentRunId": ctx.context.run_id,
                "oldStageId": deal.get("stageId"),
                "newStageId": new_stage_id,
                "newProbability": new_probability,
            },
        }).execute()
    except Exception:
        # The stage move already committed — audit logging is best-effort.
        pass

    await publish_event(
        ctx.context,
        "action",
        f"Deal '{deal_title}' → {new_stage_name}",
        agent_type=ctx.context.current_agent_type,
        metadata={"dealId": deal_id, "stageId": new_stage_id},
    )

    try:
        await persist_log(
            ctx.context,
            action_type="deal_stage_advanced",
            outcome="completed",
            reasoning=f"{deal_title} → {new_stage_name}. {reason}",
            deal_id=deal_id,
        )
    except Exception:
        # The stage move already committed — audit logging is best-effort.
        pass

    return {
        "ok": True,
        "dealId": deal_id,
        "stage": new_stage_name,
        "probability": new_probability,
    }


@function_tool
@idempotent_tool
async def create_deal(
    ctx: RunContextWrapper[AgentContext],
    title: str,
    stage_id: str | None = None,
    description: str | None = None,
    value: float | None = None,
    address: str | None = None,
    priority: str | None = None,
    close_date: str | None = None,
    contact_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Create a new deal in a pipeline stage.

    title: short label shown on the kanban card. Required.
    stage_id: target DealStage.id. Optional — if omitted the deal lands in the
      first stage of the buyer pipeline when a buyer contact is linked, otherwise
      the first stage of the seller pipeline.
    description: optional deal notes / description.
    value: deal value in dollars.
    address: property address if relevant.
    priority: 'LOW' | 'MEDIUM' | 'HIGH'. Defaults to MEDIUM.
    close_date: ISO 8601 date/datetime string for expected close.
    contact_ids: list of Contact.id values to link to this deal.

    Use when the realtor says "create a deal", "add a deal", "start a deal",
    "open a deal for [name]", etc.
    """
    space_id = ctx.context.space_id
    db = await supabase()
    now = datetime.now(timezone.utc).isoformat()

    clean_title = title.strip()[:255] if title else ""
    if not clean_title:
        return {"error": "title is required"}

    valid_priorities = {"LOW", "MEDIUM", "HIGH"}
    clean_priority = (priority or "MEDIUM").strip().upper()
    if clean_priority not in valid_priorities:
        clean_priority = "MEDIUM"

    # Validate contact IDs and detect pipeline type from lead types
    valid_contact_ids: list[str] = []
    buyer_among_contacts = False
    if contact_ids:
        contacts_res = await (
            db.table("Contact")
            .select("id,leadType")
            .in_("id", contact_ids[:10])
            .eq("spaceId", space_id)
            .execute()
        )
        valid_rows = contacts_res.data or []
        valid_set = {r["id"] for r in valid_rows}
        valid_contact_ids = [cid for cid in contact_ids if cid in valid_set]
        buyer_among_contacts = any(r.get("leadType") == "buyer" for r in valid_rows)

    # Stage resolution
    stage: dict[str, Any] | None = None
    if stage_id:
        stage_res = await (
            db.table("DealStage")
            .select("id,name,pipelineType")
            .eq("id", stage_id)
            .eq("spaceId", space_id)
            .maybe_single()
            .execute()
        )
        stage = stage_res.data

    if not stage:
        preferred = "buyer" if buyer_among_contacts else "seller"
        fallback_res = await (
            db.table("DealStage")
            .select("id,name,pipelineType")
            .eq("spaceId", space_id)
            .eq("pipelineType", preferred)
            .order("position")
            .limit(1)
            .execute()
        )
        if fallback_res.data:
            stage = fallback_res.data[0]
        else:
            any_res = await (
                db.table("DealStage")
                .select("id,name,pipelineType")
                .eq("spaceId", space_id)
                .order("position")
                .limit(1)
                .execute()
            )
            if any_res.data:
                stage = any_res.data[0]

    if not stage:
        return {"error": "No pipeline stages configured in this workspace — set one up before creating deals."}

    # Auto-route buyer deals to buyer pipeline
    final_stage = stage
    if buyer_among_contacts and stage.get("pipelineType") != "buyer":
        buyer_res = await (
            db.table("DealStage")
            .select("id,name,pipelineType")
            .eq("spaceId", space_id)
            .eq("pipelineType", "buyer")
            .order("position")
            .limit(1)
            .execute()
        )
        if buyer_res.data:
            final_stage = buyer_res.data[0]

    final_stage_id = final_stage["id"]

    # Position at bottom of stage
    pos_res = await (
        db.table("Deal")
        .select("position")
        .eq("stageId", final_stage_id)
        .eq("spaceId", space_id)
        .order("position", desc=True)
        .limit(1)
        .execute()
    )
    last_pos = (pos_res.data[0]["position"] if pos_res.data else -1)
    next_position = last_pos + 1

    import uuid as _uuid
    deal_id = str(_uuid.uuid4())

    deal_row: dict[str, Any] = {
        "id": deal_id,
        "spaceId": space_id,
        "title": clean_title,
        "stageId": final_stage_id,
        "priority": clean_priority,
        "position": next_position,
        "status": "active",
        "createdAt": now,
        "updatedAt": now,
    }
    if description:
        deal_row["description"] = description.strip()[:5000]
    if value is not None and value >= 0:
        deal_row["value"] = value
    if address:
        deal_row["address"] = address.strip()[:500]
    if close_date:
        deal_row["closeDate"] = close_date

    try:
        await db.table("Deal").insert(deal_row).execute()
    except Exception as e:
        agent_err = from_exception(e)
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}

    # Link contacts
    if valid_contact_ids:
        try:
            await db.table("DealContact").insert([
                {"dealId": deal_id, "contactId": cid}
                for cid in valid_contact_ids
            ]).execute()
        except Exception:
            pass

    # Activity row
    try:
        await db.table("DealActivity").insert({
            "id": str(_uuid.uuid4()),
            "dealId": deal_id,
            "spaceId": space_id,
            "type": "note",
            "content": f"[Agent] Deal created: {clean_title}",
            "metadata": {"source": "agent", "agentRunId": ctx.context.run_id},
        }).execute()
    except Exception:
        pass

    await publish_event(
        ctx.context,
        "action",
        f"Created deal '{clean_title}' in {final_stage['name']}",
        agent_type=ctx.context.current_agent_type,
        metadata={"dealId": deal_id, "stageId": final_stage_id},
    )

    return {
        "ok": True,
        "dealId": deal_id,
        "title": clean_title,
        "stageName": final_stage["name"],
        "linkedContactIds": valid_contact_ids,
    }


@function_tool
@idempotent_tool
async def request_deal_review(
    ctx: RunContextWrapper[AgentContext],
    deal_id: str,
    reason: str,
) -> dict[str, Any]:
    """Flag a deal up to the brokerage for human review.

    Use when something looks off — a stalled high-value deal, an unusual
    commission split, a client raising legal concerns. Creates a
    DealReviewRequest visible to brokers in the brokerage.

    Only works for spaces inside a brokerage. Solo realtors get an error.

    reason: required, 10+ chars. Surfaces verbatim to the broker.
    """
    if not reason or len(reason.strip()) < 10:
        agent_err = from_supabase_error({"message": "reason must be at least 10 characters", "code": None})
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}

    space_id = ctx.context.space_id
    db = await supabase()

    deal_check = await (
        db.table("Deal")
        .select("id,title")
        .eq("id", deal_id)
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )
    if not deal_check.data:
        agent_err = from_supabase_error({"message": "Deal not found in space", "code": None})
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}
    deal_title = deal_check.data.get("title") or deal_id[:8]

    space_check = await (
        db.table("Space")
        .select("id,ownerId,brokerageId")
        .eq("id", space_id)
        .maybe_single()
        .execute()
    )
    if not space_check.data or not space_check.data.get("brokerageId"):
        agent_err = from_supabase_error({"message": "Space is not part of a brokerage — review requests need a broker", "code": None})
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}

    review_id = str(uuid.uuid4())
    try:
        await db.table("DealReviewRequest").insert({
            "id": review_id,
            "dealId": deal_id,
            "requestingUserId": space_check.data["ownerId"],
            "brokerageId": space_check.data["brokerageId"],
            "status": "open",
            "reason": reason.strip(),
        }).execute()
    except Exception as e:
        agent_err = from_exception(e)
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}

    await publish_event(
        ctx.context,
        "action",
        f"Review requested on '{deal_title}'",
        agent_type=ctx.context.current_agent_type,
        metadata={"dealId": deal_id, "reviewId": review_id},
    )

    try:
        await persist_log(
            ctx.context,
            action_type="review_requested",
            outcome="queued_for_approval",
            reasoning=reason.strip()[:500],
            deal_id=deal_id,
        )
    except Exception:
        # The review request row already committed — logging is best-effort.
        pass

    return {
        "ok": True,
        "reviewId": review_id,
        "dealId": deal_id,
        "status": "open",
    }
