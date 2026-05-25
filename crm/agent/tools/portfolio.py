"""Portfolio analysis tool — synthesise cross-contact signals into space-level insights."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from memory.store import save_memory
from security.context import AgentContext


@function_tool
async def analyze_portfolio(
    ctx: RunContextWrapper[AgentContext],
) -> dict[str, Any]:
    """Analyse the full contact and deal portfolio for the space.

    Fetches all contacts and active deals concurrently, computes space-level
    health metrics, generates narrative insights, and persists a summary memory
    so the agent accumulates portfolio awareness over time.
    """
    space_id = ctx.context.space_id
    db = await supabase()

    # --- Concurrent fetch -------------------------------------------------------
    contacts_query = (
        db.table("Contact")
        .select("id,leadScore,leadType,lastContactedAt,followUpAt,tags,type")
        .eq("spaceId", space_id)
    )
    deals_query = (
        db.table("Deal")
        .select("id,value,closeDate,status,probability")
        .eq("spaceId", space_id)
        .eq("status", "active")
    )

    try:
        contacts_res, deals_res = await asyncio.gather(
            contacts_query.execute(),
            deals_query.execute(),
        )
    except Exception as exc:
        return {"error": f"Portfolio analysis failed: {exc}"}

    contacts: list[dict[str, Any]] = contacts_res.data or []
    deals: list[dict[str, Any]] = deals_res.data or []

    now = datetime.now(timezone.utc)
    cutoff_30d = now - timedelta(days=30)
    cutoff_14d = now - timedelta(days=14)
    closing_cutoff = (now + timedelta(days=14)).date().isoformat()

    # --- Contact metrics --------------------------------------------------------
    contact_count = len(contacts)

    high_score_count = sum(
        1 for c in contacts if (c.get("leadScore") or 0) >= 70
    )

    def _is_overdue(c: dict[str, Any]) -> bool:
        follow_up = c.get("followUpAt")
        if follow_up:
            try:
                fu_dt = datetime.fromisoformat(follow_up.replace("Z", "+00:00"))
                return fu_dt < now
            except ValueError:
                pass
        # Fallback: no followUpAt but haven't been contacted in 30+ days
        last = c.get("lastContactedAt")
        if last is None:
            return True
        try:
            last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
            return last_dt < cutoff_30d
        except ValueError:
            return False

    overdue_followup_count = sum(1 for c in contacts if _is_overdue(c))

    # Contacts are stored lowercase ("rental" / "buyer") per the LeadType
    # Literal in schemas.py and the TS contract — uppercase comparison
    # silently zeroed both counts on every run.
    rental_count = sum(1 for c in contacts if (c.get("leadType") or "").lower() == "rental")
    buyer_count = sum(1 for c in contacts if (c.get("leadType") or "").lower() == "buyer")
    rental_pct = round(rental_count / contact_count * 100, 1) if contact_count else 0.0
    buyer_pct = round(buyer_count / contact_count * 100, 1) if contact_count else 0.0

    scores = [c.get("leadScore") or 0 for c in contacts]
    avg_lead_score = round(sum(scores) / len(scores), 1) if scores else 0.0

    engaged_count = 0
    for c in contacts:
        last = c.get("lastContactedAt")
        if last:
            try:
                last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
                if last_dt >= cutoff_14d:
                    engaged_count += 1
            except ValueError:
                pass
    engagement_rate_pct = round(engaged_count / contact_count * 100, 1) if contact_count else 0.0

    # Top 3 contacts by leadScore
    sorted_contacts = sorted(contacts, key=lambda c: c.get("leadScore") or 0, reverse=True)
    hot_leads = [
        {"id": c["id"], "leadScore": c.get("leadScore") or 0}
        for c in sorted_contacts[:3]
    ]

    # --- Deal metrics -----------------------------------------------------------
    pipeline_value = sum(
        (d.get("value") or 0) * ((d.get("probability") or 0) / 100)
        for d in deals
    )
    pipeline_value = round(pipeline_value, 2)

    deals_closing_14d = sum(
        1
        for d in deals
        if d.get("closeDate") and d["closeDate"] <= closing_cutoff
    )

    # --- Narrative insights -----------------------------------------------------
    insights: list[str] = []

    if engagement_rate_pct < 30:
        insights.append(
            f"Only {engagement_rate_pct}% of contacts have been touched in the past 14 days"
            " — consider activating the Long-Term Nurture agent."
        )

    if deals_closing_14d > 0:
        insights.append(
            f"{deals_closing_14d} deal(s) closing within 14 days need priority attention."
        )

    if high_score_count > 5:
        insights.append(
            f"{high_score_count} hot leads (score ≥ 70) are in the pipeline"
            " — prioritize these for personal outreach."
        )

    if avg_lead_score < 40 and not insights:
        # Only surface this if no higher-priority insight was generated
        insights.append(
            f"Portfolio average score is low ({avg_lead_score}/100)"
            " — a scoring pass could surface hidden opportunities."
        )

    # Ensure at least one insight is always returned
    if not insights:
        if overdue_followup_count > 0:
            insights.append(
                f"{overdue_followup_count} contact(s) have overdue follow-ups"
                " — review and reschedule to keep the pipeline healthy."
            )
        else:
            insights.append(
                f"Portfolio looks healthy: {contact_count} contacts,"
                f" avg score {avg_lead_score}/100,"
                f" pipeline value ${pipeline_value:,.0f}."
            )

    # --- Persist space-level memory ---------------------------------------------
    summary = (
        f"Portfolio snapshot: {contact_count} contacts, avg score {avg_lead_score}/100, "
        f"{high_score_count} hot leads, engagement {engagement_rate_pct}%, "
        f"pipeline ${pipeline_value:,.0f}, {deals_closing_14d} deal(s) closing in 14d."
    )
    await save_memory(
        space_id=space_id,
        entity_type="space",
        entity_id=space_id,
        memory_type="observation",
        content=f"Portfolio analysis: {summary}",
        importance=0.6,
    )

    return {
        "contact_count": contact_count,
        "high_score_count": high_score_count,
        "overdue_followup_count": overdue_followup_count,
        "rental_pct": rental_pct,
        "buyer_pct": buyer_pct,
        "pipeline_value": pipeline_value,
        "deals_closing_14d": deals_closing_14d,
        "avg_lead_score": avg_lead_score,
        "hot_leads": hot_leads,
        "engagement_rate_pct": engagement_rate_pct,
        "insights": insights,
    }
