"""Agent guardrails — pre-run safety checks for Chippi.

Input guardrail (fires before the first LLM call):
  pending_drafts_guardrail — blocks the run if the realtor already has
  ≥10 unreviewed drafts. Prevents the agent from burying the realtor in
  drafts they haven't had time to review.
"""

from __future__ import annotations

from typing import Any

from agents import Agent, GuardrailFunctionOutput, RunContextWrapper, input_guardrail

from db import supabase
from security.context import AgentContext


DRAFT_OVERLOAD_THRESHOLD = 10


@input_guardrail
async def pending_drafts_guardrail(
    ctx: RunContextWrapper[AgentContext],
    agent: Agent,
    input: Any,  # noqa: A002
) -> GuardrailFunctionOutput:
    """Block the agent run when the space already has too many unreviewed drafts.

    If the realtor hasn't reviewed 10+ drafts from previous runs, creating
    more will overwhelm them and devalue every suggestion. Wait until the
    inbox is cleared.
    """
    db = await supabase()
    result = await (
        db.table("AgentDraft")
        .select("id", count="exact")
        .eq("spaceId", ctx.context.space_id)
        .eq("status", "pending")
        .execute()
    )
    count = result.count or 0

    if count >= DRAFT_OVERLOAD_THRESHOLD:
        return GuardrailFunctionOutput(
            output_info={
                "pending_drafts": count,
                "threshold": DRAFT_OVERLOAD_THRESHOLD,
                "reason": (
                    f"Workspace has {count} unreviewed drafts "
                    f"(threshold: {DRAFT_OVERLOAD_THRESHOLD}). "
                    "Review your agent inbox before the next run."
                ),
            },
            tripwire_triggered=True,
        )

    return GuardrailFunctionOutput(
        output_info={"pending_drafts": count},
        tripwire_triggered=False,
    )
