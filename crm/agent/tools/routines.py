"""Routines tool — create, list, update, delete the realtor's standing
instructions for Chippi.

A routine is a sentence and a schedule: the realtor saves an instruction
("draft a check-in for every deal that's gone quiet") and how often it runs
(hourly / daily / weekdays at a given UTC hour). An hourly cron fires the
autonomous run with that instruction attached. Like every autonomous path,
the run DRAFTS — it never sends a message unattended.

The Routine table's trigger owns nextRunAt and updatedAt; this tool only
ever writes the instruction, the cadence, and the hour.
"""

from __future__ import annotations

import uuid
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext
from tools.base import idempotent_tool
from tools.streaming import publish_event

VALID_CADENCES = {"hourly", "daily", "weekdays"}
VALID_ACTIONS = {"list", "create", "update", "delete"}
MAX_ROUTINES = 20
MAX_INSTRUCTION = 600
MIN_INSTRUCTION = 10


@function_tool
@idempotent_tool
async def manage_routines(
    ctx: RunContextWrapper[AgentContext],
    action: str,
    # ── create / update ──
    instruction: str | None = None,
    cadence: str | None = None,
    hour: int | None = None,
    # ── update / delete ──
    routine_id: str | None = None,
    # ── update only ──
    enabled: bool | None = None,
) -> dict[str, Any]:
    """Manage the realtor's routines — standing instructions Chippi runs on a schedule.

    A routine is a sentence + a schedule. The autonomous run it fires DRAFTS
    work for the realtor to approve; it never sends messages unattended.

    action='list': return every routine in the workspace.

    action='create': create a routine. Required: instruction — a full
      sentence describing what Chippi should do. Optional: cadence ∈
      {hourly, daily, weekdays}, default 'daily'; hour 0-23 in UTC, default
      13. hour is ignored when cadence='hourly'. Times are UTC — tell the
      realtor they can fine-tune the exact time on the Routines page.

    action='update': edit a routine. Required: routine_id. Optional:
      instruction, cadence, hour, enabled (false pauses the routine).

    action='delete': remove a routine. Required: routine_id.
    """
    if action not in VALID_ACTIONS:
        return {"error": f"action must be one of {sorted(VALID_ACTIONS)}"}

    space_id = ctx.context.space_id
    db = await supabase()

    # ── LIST ──
    if action == "list":
        res = await (
            db.table("Routine")
            .select("id,instruction,cadence,hour,enabled,lastRunAt,lastRunStatus,nextRunAt")
            .eq("spaceId", space_id)
            .order("createdAt", desc=False)
            .execute()
        )
        routines = res.data or []
        return {"routines": routines, "count": len(routines)}

    # ── CREATE ──
    if action == "create":
        text = (instruction or "").strip()
        if len(text) < MIN_INSTRUCTION:
            return {"error": "instruction is required — a full sentence describing what Chippi should do"}
        cad = (cadence or "daily").strip().lower()
        if cad not in VALID_CADENCES:
            return {"error": f"cadence must be one of {sorted(VALID_CADENCES)}"}
        hr = 13 if hour is None else int(hour)
        if hr < 0 or hr > 23:
            return {"error": "hour must be between 0 and 23 (UTC)"}

        existing = await (
            db.table("Routine").select("id").eq("spaceId", space_id).execute()
        )
        if len(existing.data or []) >= MAX_ROUTINES:
            return {"error": f"This workspace already has the maximum of {MAX_ROUTINES} routines"}

        new_id = str(uuid.uuid4())
        # nextRunAt and updatedAt are set by the Routine table trigger.
        await (
            db.table("Routine")
            .insert({
                "id": new_id,
                "spaceId": space_id,
                "instruction": text[:MAX_INSTRUCTION],
                "cadence": cad,
                "hour": hr,
            })
            .execute()
        )

        await publish_event(
            ctx.context,
            "action",
            f"Routine created: {text[:80]}",
            agent_type=ctx.context.current_agent_type,
            metadata={"routineId": new_id, "cadence": cad},
        )
        return {"created": True, "routineId": new_id, "cadence": cad, "hour": hr}

    # ── UPDATE / DELETE both need an existing routine ───────────────────────
    if not routine_id:
        return {"error": f"routine_id is required for action='{action}'"}

    check = await (
        db.table("Routine")
        .select("id,instruction")
        .eq("id", routine_id)
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )
    if not check or not check.data:
        return {"error": "Routine not found in this workspace"}
    existing_text = check.data.get("instruction", "")

    # ── DELETE ──
    if action == "delete":
        await (
            db.table("Routine")
            .delete()
            .eq("id", routine_id)
            .eq("spaceId", space_id)
            .execute()
        )
        await publish_event(
            ctx.context,
            "action",
            f"Routine deleted: {existing_text[:80]}",
            agent_type=ctx.context.current_agent_type,
            metadata={"routineId": routine_id},
        )
        return {"deleted": True, "routineId": routine_id}

    # ── UPDATE ──
    patch: dict[str, Any] = {}
    if instruction is not None:
        text = instruction.strip()
        if len(text) < MIN_INSTRUCTION:
            return {"error": "instruction must be a full sentence"}
        patch["instruction"] = text[:MAX_INSTRUCTION]
    if cadence is not None:
        cad = cadence.strip().lower()
        if cad not in VALID_CADENCES:
            return {"error": f"cadence must be one of {sorted(VALID_CADENCES)}"}
        patch["cadence"] = cad
    if hour is not None:
        hr = int(hour)
        if hr < 0 or hr > 23:
            return {"error": "hour must be between 0 and 23 (UTC)"}
        patch["hour"] = hr
    if enabled is not None:
        patch["enabled"] = bool(enabled)

    if not patch:
        return {"error": "nothing to update — pass instruction, cadence, hour, or enabled"}

    await (
        db.table("Routine")
        .update(patch)
        .eq("id", routine_id)
        .eq("spaceId", space_id)
        .execute()
    )
    await publish_event(
        ctx.context,
        "action",
        f"Routine updated: {existing_text[:80]}",
        agent_type=ctx.context.current_agent_type,
        metadata={"routineId": routine_id},
    )
    return {"updated": True, "routineId": routine_id, "fields": sorted(patch.keys())}
