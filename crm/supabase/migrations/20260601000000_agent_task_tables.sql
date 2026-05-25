-- AgentTask, ExecutionStep, and TaskCheckpoint tables for the agentic runtime.
--
-- These three tables back the task-execution layer of the agentic system:
--
--   AgentTask        — a unit of work the agent has been asked to perform.
--                      May be triggered manually, by a schedule, or by another
--                      task (parentTaskId). Tracks overall status, token spend,
--                      and estimated cost so the realtor can audit what Chippi
--                      has been doing.
--
--   ExecutionStep    — one tool call within a task run. A task produces a
--                      sequential list of steps; each step records the tool
--                      name, args, result, and its own token/cost share.
--                      The idempotencyKey column allows the runtime to detect
--                      and skip duplicate step submissions on retry.
--
--   TaskCheckpoint   — a point-in-time snapshot of task state (serialised
--                      conversation/run context). Stored so a paused or failed
--                      task can be resumed from the last checkpoint rather than
--                      restarting from scratch.
--
-- All three tables carry a denormalised spaceId for cheap RLS filtering
-- without joining through AgentTask on every row scan.
--
-- Idempotent: IF NOT EXISTS guards throughout. Safe to re-run.

-- ── AgentTask ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "AgentTask" (
  "id"               text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"          text        NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "title"            text        NOT NULL,
  "description"      text,
  "status"           text        NOT NULL DEFAULT 'queued'
                       CHECK ("status" IN ('queued','running','paused','completed','failed','cancelled')),
  "triggerSource"    text        NOT NULL DEFAULT 'manual',
  "goalDescription"  text,
  -- Supports sub-tasks: a child task knows its parent. SET NULL on parent
  -- deletion so child rows survive for audit purposes.
  "parentTaskId"     text        REFERENCES "AgentTask"(id) ON DELETE SET NULL,
  "totalSteps"       int         NOT NULL DEFAULT 0,
  "completedSteps"   int         NOT NULL DEFAULT 0,
  "inputTokens"      int         NOT NULL DEFAULT 0,
  "outputTokens"     int         NOT NULL DEFAULT 0,
  "estimatedCostUsd" numeric(10,6) NOT NULL DEFAULT 0,
  "metadata"         jsonb       DEFAULT '{}',
  "startedAt"        timestamptz,
  "completedAt"      timestamptz,
  "cancelledAt"      timestamptz,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now()
);

-- Primary access pattern: list tasks for a space filtered by status.
CREATE INDEX IF NOT EXISTS "AgentTask_spaceId_status_idx"
  ON "AgentTask" ("spaceId", "status");

-- Sub-task tree traversal.
CREATE INDEX IF NOT EXISTS "AgentTask_parentTaskId_idx"
  ON "AgentTask" ("parentTaskId")
  WHERE "parentTaskId" IS NOT NULL;

-- ── ExecutionStep ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ExecutionStep" (
  "id"             text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "taskId"         text        NOT NULL REFERENCES "AgentTask"(id) ON DELETE CASCADE,
  -- Denormalised for RLS and for direct space-scoped queries without a join.
  "spaceId"        text        NOT NULL,
  "stepIndex"      int         NOT NULL,
  "toolName"       text        NOT NULL,
  "toolArgs"       jsonb       DEFAULT '{}',
  "toolResult"     jsonb,
  "status"         text        NOT NULL DEFAULT 'pending'
                     CHECK ("status" IN ('pending','running','completed','failed','skipped')),
  "inputTokens"    int         NOT NULL DEFAULT 0,
  "outputTokens"   int         NOT NULL DEFAULT 0,
  "costUsd"        numeric(10,6) NOT NULL DEFAULT 0,
  -- Unique token supplied by the runtime so retried submissions are deduplicated.
  "idempotencyKey" text        UNIQUE,
  "errorMessage"   text,
  "startedAt"      timestamptz,
  "completedAt"    timestamptz,
  "createdAt"      timestamptz NOT NULL DEFAULT now()
);

-- Step timeline within a task.
CREATE INDEX IF NOT EXISTS "ExecutionStep_taskId_stepIndex_idx"
  ON "ExecutionStep" ("taskId", "stepIndex");

-- Idempotency dedup lookup.
CREATE INDEX IF NOT EXISTS "ExecutionStep_idempotencyKey_idx"
  ON "ExecutionStep" ("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

-- ── TaskCheckpoint ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "TaskCheckpoint" (
  "id"             text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "taskId"         text        NOT NULL REFERENCES "AgentTask"(id) ON DELETE CASCADE,
  -- Denormalised for RLS and direct space-scoped queries without a join.
  "spaceId"        text        NOT NULL,
  -- Opaque serialised run state; the runtime owns the schema inside this blob.
  "checkpointData" jsonb       NOT NULL,
  -- Which step index was current when this checkpoint was taken.
  "stepIndex"      int         NOT NULL DEFAULT 0,
  "createdAt"      timestamptz NOT NULL DEFAULT now()
);

-- Resume path: fetch the latest checkpoint for a task.
CREATE INDEX IF NOT EXISTS "TaskCheckpoint_taskId_idx"
  ON "TaskCheckpoint" ("taskId");

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- The app uses the service role key (which bypasses RLS), so these policies
-- guard against direct PostgREST / anon-role access only. Pattern matches the
-- existing spaceId-scoped policies in 20260314000000_rls_policies.sql.

ALTER TABLE "AgentTask"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExecutionStep"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskCheckpoint"  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_task: space owner only"
  ON "AgentTask"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

CREATE POLICY "execution_step: space owner only"
  ON "ExecutionStep"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

CREATE POLICY "task_checkpoint: space owner only"
  ON "TaskCheckpoint"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

-- ── AgentDraft — idempotency key ─────────────────────────────────────────────
-- Lets the retry/idempotency system tag a draft with a stable key so duplicate
-- submissions are detected before a second draft row is created.

ALTER TABLE "AgentDraft"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" text UNIQUE;
