"""Priority list tool — ranked daily focus list for the realtor.

Called after the main work is done. The result is stored as a space-level
memory so the UI can surface it without triggering another agent run.
Re-engagement nudges (the old mark_contact_warm) live on update_contact.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from memory.store import save_memory
from security.context import AgentContext
from tools.streaming import publish_event


@function_tool
async def generate_priority_list(
    ctx: RunContextWrapper[AgentContext],
    top_n: int = 5,
) -> dict[str, Any]:
    """Generate a ranked list of contacts the realtor should focus on today.

    Scores each contact by urgency signals:
    +30  overdue follow-up (followUpAt is in the past)
    +20  high lead score (>= 70)
    +15  recent inbound message (lastContactedAt within 48h — they reached out)
    +10  active goal exists for this contact
    +8   tour scheduled or recently completed (type == 'TOUR')
    -10  contacted very recently (lastContactedAt within 24h)
    -20  no contact info (no email AND no phone)

    Returns the top top_n contacts with a brief reasoning string each.
    Stores the result as a space-level memory for the UI to read.
    """
    space_id = ctx.context.space_id
    db = await supabase()
    now = datetime.now(timezone.utc)

    contacts_res = await (
        db.table("Contact")
        .select("id,name,email,phone,leadScore,followUpAt,lastContactedAt,type,leadType")
        .eq("spaceId", space_id)
        .execute()
    )
    contacts = contacts_res.data or []

    # Load active goals (contactId → bool)
    goals_res = await (
        db.table("AgentGoal")
        .select("contactId")
        .eq("spaceId", space_id)
        .eq("status", "active")
        .execute()
    )
    contacts_with_goals = {g["contactId"] for g in (goals_res.data or []) if g.get("contactId")}

    scored: list[dict[str, Any]] = []
    for c in contacts:
        cid = c.get("id")
        name = c.get("name", "Unknown")
        score = 0
        reasons: list[str] = []

        # Overdue follow-up
        follow_up_at = c.get("followUpAt")
        if follow_up_at:
            try:
                fua = datetime.fromisoformat(follow_up_at.replace("Z", "+00:00"))
                if fua < now:
                    score += 30
                    reasons.append("follow-up overdue")
            except ValueError:
                pass

        # High lead score
        lead_score = c.get("leadScore") or 0
        if lead_score >= 70:
            score += 20
            reasons.append(f"hot lead ({lead_score}/100)")
        elif lead_score >= 50:
            score += 8
            reasons.append(f"warm lead ({lead_score}/100)")

        # Recent inbound (they reached out to us)
        last_contacted = c.get("lastContactedAt")
        if last_contacted:
            try:
                lca = datetime.fromisoformat(last_contacted.replace("Z", "+00:00"))
                hours_ago = (now - lca).total_seconds() / 3600
                if 0 < hours_ago <= 24:
                    score -= 10  # just contacted by us
                elif hours_ago <= 48:
                    score += 15
                    reasons.append("replied recently")
            except ValueError:
                pass

        # Active goal
        if cid in contacts_with_goals:
            score += 10
            reasons.append("active goal")

        # Tour contact
        if c.get("type") == "TOUR":
            score += 8
            reasons.append("tour stage")

        # No contact info — skip
        if not c.get("email") and not c.get("phone"):
            score -= 20

        if score > 0 or reasons:
            scored.append({
                "contactId": cid,
                "name": name,
                "score": score,
                "leadScore": lead_score,
                "reasons": reasons,
                "leadType": c.get("leadType"),
                "email": c.get("email"),
                "phone": c.get("phone"),
            })

    scored.sort(key=lambda x: x["score"], reverse=True)
    top = scored[:max(1, min(10, top_n))]

    # Build readable reason strings
    items = []
    for item in top:
        reason_str = ", ".join(item["reasons"]) if item["reasons"] else "needs attention"
        items.append({
            "contactId": item["contactId"],
            "name": item["name"],
            "reason": reason_str.capitalize() + ".",
            "leadScore": item["leadScore"],
            "leadType": item["leadType"],
            "hasEmail": bool(item.get("email")),
            "hasPhone": bool(item.get("phone")),
        })

    result = {
        "generatedAt": now.isoformat(),
        "items": items,
        "totalEvaluated": len(contacts),
    }

    # Store as space memory so the UI can read it without re-running the agent
    summary = f"Today's focus: {', '.join(i['name'] for i in items[:3])}" if items else "No priority contacts today."
    await save_memory(
        space_id=space_id,
        entity_type="space",
        entity_id=space_id,
        memory_type="observation",
        content=f"PRIORITY_LIST:{json.dumps(result)}",
        importance=0.9,
    )

    await publish_event(
        ctx.context,
        "action",
        f"Priority list updated: {len(items)} contact(s) to focus on today",
        agent_type=ctx.context.current_agent_type,
        metadata={"count": len(items)},
    )

    return result


