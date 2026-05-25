"""Outcome tool — record results of outreach and query the rolling window.

When the agent learns the outcome of a previous draft (responded, bounced,
meeting booked, etc.) it calls outcome(action='record', ...). When it wants
to know how the workspace is doing recently it calls
outcome(action='summary', days=N).

Recording an outcome adjusts the contact's lead score so the agent learns
what works:
  responded:       +5
  meeting_booked:  +15
  no_response:     -2
  bounced:         -5
  unsubscribed:    -20
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext
from tools.base import idempotent_tool
from tools.streaming import publish_event

VALID_OUTCOMES = {"responded", "no_response", "bounced", "unsubscribed", "meeting_booked"}
VALID_ACTIONS = {"record", "summary"}

_SCORE_DELTAS = {
    "responded": 5,
    "meeting_booked": 15,
    "no_response": -2,
    "bounced": -5,
    "unsubscribed": -20,
}


@function_tool
@idempotent_tool
async def outcome(
    ctx: RunContextWrapper[AgentContext],
    action: str,
    # ── for action='record' ──
    draft_id: str | None = None,
    outcome: str | None = None,
    notes: str | None = None,
    # ── for action='summary' ──
    days: int = 30,
) -> dict[str, Any]:
    """Record an outcome or summarise outcomes.

    action='record': Required draft_id and outcome.
      outcome ∈ {responded, no_response, bounced, unsubscribed, meeting_booked}.
      Adjusts the contact's lead score (see module docstring for deltas).

    action='summary': returns counts by outcome over the past `days` days
      (1-90, default 30) plus a response rate.
    """
    if action not in VALID_ACTIONS:
        return {"error": f"action must be one of {VALID_ACTIONS}"}

    space_id = ctx.context.space_id
    db = await supabase()

    # ── SUMMARY ──
    if action == "summary":
        period = max(1, min(90, days))
        since = (datetime.now(timezone.utc) - timedelta(days=period)).isoformat()
        result = await (
            db.table("AgentDraft")
            .select("outcome")
            .eq("spaceId", space_id)
            .not_.is_("outcome", "null")
            .gte("outcomeDetectedAt", since)
            .execute()
        )

        counts: dict[str, int] = {}
        for row in (result.data or []):
            o = row.get("outcome", "unknown")
            counts[o] = counts.get(o, 0) + 1

        total = sum(counts.values())
        positive = counts.get("responded", 0) + counts.get("meeting_booked", 0)
        response_rate = round(positive / total * 100, 1) if total > 0 else 0.0

        return {
            "period_days": period,
            "total_outcomes": total,
            "counts": counts,
            "response_rate_pct": response_rate,
        }

    # ── RECORD ──
    if not draft_id:
        return {"error": "draft_id is required for action='record'"}
    if not outcome or outcome not in VALID_OUTCOMES:
        return {"error": f"outcome must be one of {VALID_OUTCOMES}"}

    draft_check = await (
        db.table("AgentDraft")
        .select("id,contactId,outcome")
        .eq("id", draft_id)
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )
    if not draft_check.data:
        return {"error": "Draft not found in space"}

    contact_id = draft_check.data.get("contactId")
    now = datetime.now(timezone.utc).isoformat()

    await (
        db.table("AgentDraft")
        .update({"outcome": outcome, "outcomeDetectedAt": now, "updatedAt": now})
        .eq("id", draft_id)
        .eq("spaceId", space_id)
        .execute()
    )

    score_delta = _SCORE_DELTAS[outcome]
    score_adjustment = 0

    if contact_id and score_delta != 0:
        contact_check = await (
            db.table("Contact")
            .select("id,leadScore")
            .eq("id", contact_id)
            .eq("spaceId", space_id)
            .maybe_single()
            .execute()
        )
        if contact_check.data:
            current_score = contact_check.data.get("leadScore") or 50
            new_score = max(0, min(100, current_score + score_delta))
            score_adjustment = new_score - current_score
            if score_adjustment != 0:
                await (
                    db.table("Contact")
                    .update({"leadScore": new_score, "updatedAt": now})
                    .eq("id", contact_id)
                    .eq("spaceId", space_id)
                    .execute()
                )

            if notes or outcome in ("responded", "meeting_booked"):
                log_content = f"[Outcome] {outcome.replace('_', ' ').title()}"
                if notes:
                    log_content += f": {notes[:200]}"
                await db.table("ContactActivity").insert({
                    "id": str(uuid.uuid4()),
                    "contactId": contact_id,
                    "spaceId": space_id,
                    "type": "note",
                    "content": log_content,
                    "metadata": {
                        "source": "agent",
                        "draftId": draft_id,
                        "outcome": outcome,
                        "scoreAdjustment": score_adjustment,
                        "agentRunId": ctx.context.run_id,
                    },
                }).execute()

    await publish_event(
        ctx.context,
        "action",
        f"Outcome recorded: {outcome.replace('_', ' ')} (score {score_adjustment:+d})",
        agent_type=ctx.context.current_agent_type,
        metadata={"draftId": draft_id, "outcome": outcome, "scoreAdjustment": score_adjustment},
    )

    return {
        "updated": True,
        "draftId": draft_id,
        "outcome": outcome,
        "scoreAdjustment": score_adjustment,
    }
