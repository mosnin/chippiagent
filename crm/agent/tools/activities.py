"""Agent activity audit log.

Two surfaces:

  log_activity_run (function_tool, agent-facing) — the agent calls this once
    at the end of a substantive run with a summary of what was decided. The
    realtor sees these in the activity feed; brokers see them rolled up.

  persist_log (internal helper) — every lifecycle tool (book_tour,
    advance_deal_stage, route_lead, send_property_packet, request_deal_review,
    draft_message) calls this after a successful write so the broker rollup
    has per-action signal instead of one summary per run.

Both write to AgentActivityLog. Same shape, different callers.
"""

from __future__ import annotations

import uuid

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext

VALID_OUTCOMES = ("completed", "queued_for_approval", "suggested", "failed")


async def persist_log(
    ctx: AgentContext,
    action_type: str,
    outcome: str,
    reasoning: str | None = None,
    contact_id: str | None = None,
    deal_id: str | None = None,
) -> str:
    """Internal helper — write one row to AgentActivityLog. Returns the id.

    Tools call this directly after a successful write so the broker rollup
    sees concrete signal (e.g. action_type='tour_booked') rather than just
    end-of-run summaries. Failures here are swallowed by the caller — audit
    log writes should never abort the user-facing tool result.
    """
    if outcome not in VALID_OUTCOMES:
        outcome = "completed"

    db = await supabase()
    entry_id = str(uuid.uuid4())
    await db.table("AgentActivityLog").insert({
        "id": entry_id,
        "spaceId": ctx.space_id,
        "runId": ctx.run_id,
        "agentType": ctx.current_agent_type,
        "actionType": action_type,
        "reasoning": reasoning,
        "outcome": outcome,
        "relatedContactId": contact_id,
        "relatedDealId": deal_id,
    }).execute()
    return entry_id


@function_tool
async def log_activity_run(
    ctx: RunContextWrapper[AgentContext],
    action_type: str,
    outcome: str,
    reasoning: str,
    contact_id: str | None = None,
    deal_id: str | None = None,
) -> str:
    """Persist an entry to AgentActivityLog so the realtor has an audit
    trail. Call once per substantive run. Skip for trivial lookups.

    action_type: short label, e.g. 'sweep', 'tour_followup', 'lead_qualification'.
    outcome: 'completed' | 'queued_for_approval' | 'suggested' | 'failed'.
    reasoning: 1-2 sentences describing what was decided and why.
    """
    return await persist_log(
        ctx.context,
        action_type=action_type,
        outcome=outcome,
        reasoning=reasoning,
        contact_id=contact_id,
        deal_id=deal_id,
    )
