"""Goal tool — create, list, update goals in one entrypoint.

Goals are persistent objectives that span multiple runs. Create one when a
contact needs follow-up over several days, list active goals at the start of
a run, and update_status when an objective is completed or cancelled.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext
from tools.base import idempotent_tool
from tools.streaming import publish_event

VALID_GOAL_TYPES = {
    "follow_up_sequence",
    "tour_booking",
    "offer_progress",
    "deal_close",
    "reengagement",
    "custom",
}
VALID_STATUSES = {"active", "completed", "cancelled", "paused"}
VALID_ACTIONS = {"list", "create", "update_status"}


@function_tool
@idempotent_tool
async def manage_goal(
    ctx: RunContextWrapper[AgentContext],
    action: str,
    # ── for action='list' ──
    contact_id: str | None = None,
    deal_id: str | None = None,
    # ── for action='create' ──
    goal_type: str | None = None,
    description: str | None = None,
    instructions: str | None = None,
    priority: int = 0,
    # ── for action='update_status' ──
    goal_id: str | None = None,
    status: str | None = None,
    completion_notes: str | None = None,
) -> dict[str, Any]:
    """Manage persistent agent goals.

    action='list': returns up to 20 active goals, optionally filtered by
      contact_id or deal_id.

    action='create': create a new goal. Required: goal_type, description.
      goal_type ∈ {follow_up_sequence, tour_booking, offer_progress, deal_close,
      reengagement, custom}. Optional: contact_id, deal_id, instructions,
      priority (0-100).

    action='update_status': mark a goal completed/cancelled/paused. Required:
      goal_id, status. Optional: completion_notes.
    """
    if action not in VALID_ACTIONS:
        return {"error": f"action must be one of {VALID_ACTIONS}"}

    space_id = ctx.context.space_id
    db = await supabase()

    # ── LIST ──
    if action == "list":
        query = (
            db.table("AgentGoal")
            .select("id,contactId,dealId,goalType,description,instructions,priority,createdAt")
            .eq("spaceId", space_id)
            .eq("status", "active")
            .order("priority", desc=True)
            .limit(20)
        )
        if contact_id:
            query = query.eq("contactId", contact_id)
        if deal_id:
            query = query.eq("dealId", deal_id)
        result = await query.execute()
        goals = result.data or []
        return {
            "goals": goals,
            "count": len(goals),
            "filtered_by": {"contactId": contact_id, "dealId": deal_id},
        }

    # ── CREATE ──
    if action == "create":
        if not goal_type or goal_type not in VALID_GOAL_TYPES:
            return {"error": f"goal_type must be one of {VALID_GOAL_TYPES}"}
        if not description or len(description.strip()) < 5:
            return {"error": "description is required (5+ chars)"}

        # Validate referenced entities belong to space
        if contact_id:
            check = await (
                db.table("Contact")
                .select("id")
                .eq("id", contact_id)
                .eq("spaceId", space_id)
                .maybe_single()
                .execute()
            )
            if not check.data:
                return {"error": "Contact not found in space"}
        if deal_id:
            check = await (
                db.table("Deal")
                .select("id")
                .eq("id", deal_id)
                .eq("spaceId", space_id)
                .maybe_single()
                .execute()
            )
            if not check.data:
                return {"error": "Deal not found in space"}

        new_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        goal = {
            "id": new_id,
            "spaceId": space_id,
            "contactId": contact_id,
            "dealId": deal_id,
            "goalType": goal_type,
            "description": description,
            "instructions": instructions,
            "status": "active",
            "priority": max(0, min(100, priority)),
            "metadata": {"createdByRunId": ctx.context.run_id, "agentType": ctx.context.current_agent_type},
            "createdAt": now,
            "updatedAt": now,
        }
        result = await db.table("AgentGoal").insert(goal).execute()

        await publish_event(
            ctx.context,
            "action",
            f"Goal created: {description[:80]}",
            agent_type=ctx.context.current_agent_type,
            metadata={"goalId": new_id, "goalType": goal_type, "contactId": contact_id},
        )

        created = result.data[0] if result.data else goal
        return {"created": True, "goalId": created.get("id", new_id), "goalType": goal_type}

    # ── UPDATE_STATUS ──
    if not goal_id:
        return {"error": "goal_id is required for action='update_status'"}
    if not status or status not in VALID_STATUSES:
        return {"error": f"status must be one of {VALID_STATUSES}"}

    check = await (
        db.table("AgentGoal")
        .select("id,description,metadata")
        .eq("id", goal_id)
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )
    if not check.data:
        return {"error": "Goal not found in space"}

    now = datetime.now(timezone.utc).isoformat()
    update: dict[str, Any] = {"status": status, "updatedAt": now}
    if status == "completed":
        update["completedAt"] = now
    if completion_notes:
        update["metadata"] = {
            **(check.data.get("metadata") or {}),
            "completionNotes": completion_notes,
            "completedByRunId": ctx.context.run_id,
        }

    await (
        db.table("AgentGoal")
        .update(update)
        .eq("id", goal_id)
        .eq("spaceId", space_id)
        .execute()
    )

    description = check.data.get("description", "")
    await publish_event(
        ctx.context,
        "action",
        f"Goal {status}: {description[:60]}",
        agent_type=ctx.context.current_agent_type,
        metadata={"goalId": goal_id, "status": status},
    )

    return {"updated": True, "goalId": goal_id, "status": status}
