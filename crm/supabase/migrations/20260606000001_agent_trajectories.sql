-- AgentTrajectory: per-run materialized record joining tool calls, costs,
-- model, status, triggers, and outcomes into one queryable artifact.
--
-- Background: the orchestrator already records pieces of every run
-- (AgentActivityLog rows, tool-call logger entries, cost-tracker rows,
-- AgentDraft outcomes, the SSE event stream in Redis). The pieces don't
-- meet anywhere — answering "show me every run where schedule_tour was
-- called after tour_completed and the draft was approved" requires a
-- multi-table join across systems with different lifetimes.
--
-- This table materializes the trajectory at end-of-run. Read by SQL today
-- for offline eval; becomes RL training data in 12 months when the
-- (trajectory, outcome) pair count is large enough to matter.
--
-- Idempotent: IF NOT EXISTS throughout. Safe to re-run.

CREATE TABLE IF NOT EXISTS "AgentTrajectory" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The run identifier the orchestrator generates at run start. Matches
  -- the runId used in the per-run SSE stream (agent:stream:{spaceId}:{runId}
  -- in Redis) so trajectories can be joined to the live event log if needed.
  "runId" TEXT NOT NULL UNIQUE,

  -- Tenant scoping. Same FK pattern as every other agent table.
  "spaceId" UUID NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,

  "startedAt" TIMESTAMPTZ NOT NULL,
  "endedAt"   TIMESTAMPTZ,

  -- 'completed' = ran to natural end. 'error' = unhandled exception.
  -- 'timeout' = exceeded run-time budget. 'killed' = kill switch fired.
  -- 'guardrail_blocked' = input guardrail (e.g. drafts-pending-cap) refused
  --   to start the run. Each has different signal value for eval.
  "status" TEXT NOT NULL CHECK ("status" IN (
    'completed', 'error', 'timeout', 'killed', 'guardrail_blocked'
  )),

  -- The trigger that started the run, or null for cron-sweep mode (no
  -- specific event, agent went looking for things to do). Shape mirrors
  -- the trigger event JSON: { event, contactId, dealId, ... }.
  "trigger" JSONB,

  -- The model the run finished on. May differ from what was requested if
  -- the orchestrator fell back through _FALLBACK_MODELS on a 429.
  "model" TEXT,

  "totalTokens" INTEGER DEFAULT 0,

  -- The full tool-call sequence as emitted by the SDK's stream events.
  -- Each entry: { phase: 'start'|'complete', tool, args, summary, ts }
  -- where args (start) is the truncated stringified arg payload and
  -- summary (complete) is the truncated tool output. This is the part
  -- offline eval queries against — "find runs where draft_email was
  -- called and confidence > 0.8."
  "toolCalls" JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- First 280 chars of the agent's final_output. Useful for human grep
  -- when triaging "what did Chippi actually decide on this run."
  "finalSummary" TEXT,

  -- Escape hatch for orchestrator-side context that doesn't fit the
  -- typed columns above (e.g. error message detail on status='error',
  -- fallback model attempts, downstream side-effects). Don't enforce a
  -- schema here — the point is capture, not tidiness.
  "extra" JSONB DEFAULT '{}'::jsonb,

  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Time-window queries per realtor: "show me the last 50 runs for this space"
CREATE INDEX IF NOT EXISTS "AgentTrajectory_spaceId_startedAt_idx"
  ON "AgentTrajectory"("spaceId", "startedAt" DESC);

-- Direct runId lookup (joining to AgentActivityLog rows or the SSE stream)
CREATE INDEX IF NOT EXISTS "AgentTrajectory_runId_idx"
  ON "AgentTrajectory"("runId");

-- Cross-run tool-usage queries: "find every run where this tool was called"
-- and pattern-based filters on the JSONB payload. GIN keeps this fast even
-- with hundreds of thousands of trajectories.
CREATE INDEX IF NOT EXISTS "AgentTrajectory_toolCalls_gin_idx"
  ON "AgentTrajectory" USING GIN ("toolCalls" jsonb_path_ops);

-- Trigger-event filter: "find every run that started from a new_lead trigger"
CREATE INDEX IF NOT EXISTS "AgentTrajectory_trigger_gin_idx"
  ON "AgentTrajectory" USING GIN ("trigger" jsonb_path_ops);
