"""AgentTrajectory recorder — per-run materialized record.

At end of every orchestrator run (success, failure, kill, guardrail-blocked)
we write a single row capturing the full tool-call sequence, the final
status, the model used, the trigger that started the run, and the token
count. The pieces already exist scattered across AgentActivityLog,
ToolCallLog, AgentDraft, and the cost-tracker; this row materializes them.

Why a dedicated table instead of joining at query time:
  - The pieces have different lifetimes (tool-call logs trim, the SSE
    Redis stream expires in 2h). A single row at end-of-run preserves the
    trajectory permanently.
  - Cross-run queries ("every run where schedule_tour fired after
    tour_completed and the draft was approved") become a single SELECT
    with a JSONB filter — fast with the GIN index.
  - The (trajectory, outcome) pair becomes the natural unit for offline
    eval today and RL training data in 12 months.

Never raises — a trajectory write failure is logged but does NOT block
the agent's response or affect downstream behavior. Trajectories are
observability, not correctness.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from db import get_pool

logger = logging.getLogger(__name__)

# Cap stored args/summaries so a pathological tool call can't blow up the
# table. The realtor-facing live stream truncates at the same boundaries
# (see _translate_tool_event in orchestrator.py).
_MAX_ARGS_CHARS = 500
_MAX_SUMMARY_CHARS = 1000
_MAX_TOOL_CALLS = 200


def _truncate(value: Any, cap: int) -> str | None:
    """Stringify and cap. Returns None on falsy input."""
    if value is None or value == "":
        return None
    s = value if isinstance(value, str) else str(value)
    if len(s) > cap:
        return s[: cap - 1] + "…"
    return s


def normalize_tool_call(event_payload: dict) -> dict:
    """Translate an orchestrator on_event payload into a trajectory entry.

    The orchestrator's _translate_tool_event yields
      { message, metadata: { tool, phase, args | summary } }
    Strip back to the structured fields the trajectory needs and add a
    timestamp so downstream eval can reconstruct ordering even if rows
    arrive out-of-band.
    """
    meta = event_payload.get("metadata") or {}
    phase = meta.get("phase")
    return {
        "phase": phase if phase in ("start", "complete") else "start",
        "tool": meta.get("tool") or "unknown",
        "args": _truncate(meta.get("args"), _MAX_ARGS_CHARS) if phase == "start" else None,
        "summary": _truncate(meta.get("summary"), _MAX_SUMMARY_CHARS) if phase == "complete" else None,
        "ts": int(datetime.now(timezone.utc).timestamp() * 1000),
    }


async def record_trajectory(
    *,
    run_id: str,
    space_id: str,
    started_at: datetime,
    status: str,
    trigger: dict | None = None,
    model: str | None = None,
    total_tokens: int = 0,
    tool_calls: list[dict] | None = None,
    final_summary: str | None = None,
    extra: dict | None = None,
) -> None:
    """Persist one trajectory row. Upserts on runId so the same run
    can be safely re-recorded (e.g. orchestrator retry surfaces).

    Truncates the tool-call sequence at _MAX_TOOL_CALLS to bound the
    JSONB payload. A run that emits >200 tool events is either a bug
    or a runaway loop; capping here keeps the table sane and gives the
    kill switch something visible to grep against.
    """
    pool = await get_pool()

    capped_tool_calls = (tool_calls or [])[:_MAX_TOOL_CALLS]
    truncated_summary = _truncate(final_summary, 280)

    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO "AgentTrajectory"
                  ("runId", "spaceId", "startedAt", "endedAt", "status",
                   "trigger", "model", "totalTokens", "toolCalls",
                   "finalSummary", "extra")
                VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10, $11::jsonb)
                ON CONFLICT ("runId") DO UPDATE SET
                  "endedAt"      = EXCLUDED."endedAt",
                  "status"       = EXCLUDED."status",
                  "model"        = EXCLUDED."model",
                  "totalTokens"  = EXCLUDED."totalTokens",
                  "toolCalls"    = EXCLUDED."toolCalls",
                  "finalSummary" = EXCLUDED."finalSummary",
                  "extra"        = EXCLUDED."extra"
                """,
                run_id,
                space_id,
                started_at,
                datetime.now(timezone.utc),
                status,
                json.dumps(trigger) if trigger else None,
                model,
                total_tokens,
                json.dumps(capped_tool_calls),
                truncated_summary,
                json.dumps(extra or {}),
            )
    except Exception as exc:
        # Trajectory writes must never block the agent. Log and move on.
        logger.warning(
            "agent_trajectory_write_failed",
            extra={"run_id": run_id, "error": str(exc)},
        )
