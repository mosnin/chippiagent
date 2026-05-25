"""Brokerage lead routing — agent assigns a contact to a realtor.

The brokerage routing engine lives in lib/brokerage-routing.ts (TypeScript
side). This tool gives the agent a way to:

  1. Preview what the routing engine would do for a contact (dry run).
  2. Commit the assignment by moving the Contact's spaceId to the
     destination realtor's space.

Only works inside a brokerage. Solo realtor spaces get a no-op error.

Defensive by default: commit=False unless the agent is explicit, so a
mis-call previews instead of mutating.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext
from tools.activities import persist_log
from tools.base import idempotent_tool
from tools.streaming import publish_event


@function_tool
@idempotent_tool
async def route_lead(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    target_user_id: str | None = None,
    commit: bool = False,
) -> dict[str, Any]:
    """Suggest or commit a brokerage routing decision for a contact.

    target_user_id: if provided, manual override — assigns to that
      brokerage member directly (after eligibility check). If omitted,
      evaluates DealRoutingRule rows in priority order and picks the
      first matching destination. Round-robin / score-based pool
      methods aren't selected client-side here; manual override is.

    commit: when True, actually moves the contact to the destination
      realtor's space. When False (default), returns a preview without
      writing anything.

    Returns: {
      ok, action: 'previewed' | 'routed' | 'no-op',
      destinationUserId, destinationSpaceId, ruleMatched (id or null),
      contactId
    }
    """
    space_id = ctx.context.space_id
    db = await supabase()

    contact_check = await (
        db.table("Contact")
        .select("id,name,leadType,budget,tags,spaceId")
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )
    if not contact_check.data:
        return {"error": "Contact not found in space"}
    contact = contact_check.data

    # Resolve brokerage from the current space
    space_row = await (
        db.table("Space")
        .select("id,ownerId,brokerageId")
        .eq("id", space_id)
        .maybe_single()
        .execute()
    )
    if not space_row.data or not space_row.data.get("brokerageId"):
        return {"error": "Space is not part of a brokerage — routing only applies inside a brokerage"}
    brokerage_id = space_row.data["brokerageId"]

    # ── Manual override path ──
    if target_user_id:
        target_space = await _resolve_space_for_user(db, target_user_id, brokerage_id)
        if not target_space:
            return {"error": "target_user_id is not an active member of this brokerage"}
        if target_space["id"] == space_id:
            return {"ok": True, "action": "no-op", "note": "Already in this realtor's space"}
        if not commit:
            return _preview(contact_id, target_user_id, target_space["id"], None)
        return await _commit_route(db, ctx.context, contact_id, target_user_id, target_space["id"], None)

    # ── Rules-based path ──
    rules_res = await (
        db.table("DealRoutingRule")
        .select(
            "id,priority,enabled,leadType,minBudget,maxBudget,matchTag,"
            "destinationUserId,destinationPoolMethod"
        )
        .eq("brokerageId", brokerage_id)
        .eq("enabled", True)
        .order("priority")
        .execute()
    )
    rules = rules_res.data or []

    matched_rule = None
    matched_user_id: str | None = None
    matched_space_id: str | None = None

    for rule in rules:
        if not _rule_matches(rule, contact):
            continue
        # Only direct-user destinations are committed by this tool.
        # Pool methods (round-robin / score-based) require the TS
        # routing engine; surface them as "would route via pool" preview.
        dest_user = rule.get("destinationUserId")
        if dest_user:
            dest_space = await _resolve_space_for_user(db, dest_user, brokerage_id)
            if dest_space:
                matched_rule = rule
                matched_user_id = dest_user
                matched_space_id = dest_space["id"]
                break
            # Destination user is no longer eligible — fall through to next rule
            continue
        # Pool method — preview only
        return {
            "ok": True,
            "action": "previewed",
            "contactId": contact_id,
            "ruleMatched": rule.get("id"),
            "note": (
                f"Rule '{rule.get('id', '')[:8]}' uses pool method "
                f"'{rule.get('destinationPoolMethod')}' — needs the brokerage "
                "routing engine to pick a destination."
            ),
        }

    if not matched_user_id or not matched_space_id:
        return {
            "ok": True,
            "action": "no-op",
            "contactId": contact_id,
            "note": "No routing rule matched and no manual target_user_id given.",
        }

    if not commit:
        return _preview(contact_id, matched_user_id, matched_space_id, matched_rule.get("id"))

    return await _commit_route(
        db, ctx.context, contact_id, matched_user_id, matched_space_id,
        matched_rule.get("id"),
    )


# ── helpers ──────────────────────────────────────────────────────────────────

def _preview(contact_id: str, user_id: str, space_id: str, rule_id: str | None) -> dict[str, Any]:
    return {
        "ok": True,
        "action": "previewed",
        "contactId": contact_id,
        "destinationUserId": user_id,
        "destinationSpaceId": space_id,
        "ruleMatched": rule_id,
        "note": "Preview only. Re-call with commit=True to actually route.",
    }


def _rule_matches(rule: dict[str, Any], contact: dict[str, Any]) -> bool:
    lt = rule.get("leadType")
    if lt and contact.get("leadType") != lt:
        return False

    budget = contact.get("budget")
    min_b = rule.get("minBudget")
    if min_b is not None and (budget is None or float(budget) < float(min_b)):
        return False
    max_b = rule.get("maxBudget")
    if max_b is not None and (budget is None or float(budget) > float(max_b)):
        return False

    match_tag = rule.get("matchTag")
    if match_tag:
        tags = contact.get("tags") or []
        if match_tag not in tags:
            return False

    return True


async def _resolve_space_for_user(db, user_id: str, brokerage_id: str) -> dict[str, Any] | None:
    """Find the realtor_member's Space inside this brokerage. Returns None if
    the user isn't an active brokerage member or has no Space."""
    member = await (
        db.table("BrokerageMembership")
        .select("userId,role")
        .eq("userId", user_id)
        .eq("brokerageId", brokerage_id)
        .eq("role", "realtor_member")
        .maybe_single()
        .execute()
    )
    if not member.data:
        return None
    space = await (
        db.table("Space")
        .select("id,ownerId,brokerageId")
        .eq("ownerId", user_id)
        .eq("brokerageId", brokerage_id)
        .maybe_single()
        .execute()
    )
    return space.data if space.data else None


async def _commit_route(
    db,
    ctx_ctx: AgentContext,
    contact_id: str,
    dest_user_id: str,
    dest_space_id: str,
    rule_id: str | None,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()

    # Audit log against the SOURCE space first — this is the realtor whose
    # contact just left, and they need to see why. Once the Contact row
    # moves to the destination space the source space loses access to it,
    # so we have to log before mutating.
    try:
        await persist_log(
            ctx_ctx,
            action_type="lead_routed_out",
            outcome="completed",
            reasoning=(
                f"Routed to user {dest_user_id[:8]}"
                + (f" via rule {rule_id[:8]}" if rule_id else " (manual override)")
            ),
            contact_id=contact_id,
        )
    except Exception:
        pass

    # Scope the move by the SOURCE space. RLS is bypassed on the agent's
    # direct-Postgres connection, so this .eq("spaceId", ...) is the only
    # guard that the contact still belongs to the caller before it crosses
    # the tenant boundary. A 0-row result means the contact left the space
    # between the eligibility check and here — abort, don't fake success.
    moved = await (
        db.table("Contact")
        .update({"spaceId": dest_space_id, "updatedAt": now})
        .eq("id", contact_id)
        .eq("spaceId", ctx_ctx.space_id)
        .execute()
    )
    if not moved.data:
        return {"error": "Contact is no longer in this space — routing aborted"}

    # Mirror the log into the DESTINATION space so the receiving realtor
    # also sees a "lead_routed_in" entry on their activity feed.
    try:
        db_ = await supabase()
        await db_.table("AgentActivityLog").insert({
            "id": str(uuid.uuid4()),
            "spaceId": dest_space_id,
            "runId": ctx_ctx.run_id,
            "agentType": ctx_ctx.current_agent_type,
            "actionType": "lead_routed_in",
            "reasoning": (
                f"Received contact via "
                + (f"rule {rule_id[:8]}" if rule_id else "manual routing")
            ),
            "outcome": "completed",
            "relatedContactId": contact_id,
        }).execute()
    except Exception:
        pass

    await publish_event(
        ctx_ctx,
        "action",
        f"Routed contact to {dest_user_id[:8]}…",
        agent_type=ctx_ctx.current_agent_type,
        metadata={"contactId": contact_id, "destinationSpaceId": dest_space_id},
    )

    return {
        "ok": True,
        "action": "routed",
        "contactId": contact_id,
        "destinationUserId": dest_user_id,
        "destinationSpaceId": dest_space_id,
        "ruleMatched": rule_id,
    }
