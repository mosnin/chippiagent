-- ============================================================================
-- RLS policies for all agent task and artifact tables
-- ============================================================================
--
-- Migrations 20260601000000 through 20260601000003 created and enabled RLS on
-- the new agent tables but did not attach policies (except AgentTask,
-- ExecutionStep, and TaskCheckpoint which ship with policies in 000).
-- This migration attaches the missing policies and enables RLS on the older
-- agent tables that were created before the policy convention was established.
--
-- Pattern: every policy uses the same spaceId-scoped owner check that the rest
-- of the codebase uses (see 20260314000000_rls_policies.sql):
--
--   "spaceId" IN (SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id())
--
-- For tables without a direct spaceId column (TaskDependency) an EXISTS
-- subquery joins through the owning table.
--
-- The app uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS; these policies
-- guard against direct PostgREST / anon-role access only.
-- ============================================================================

-- ── Enable RLS on older agent tables (idempotent — re-enabling is a no-op) ──

ALTER TABLE "AgentActivityLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentDraft"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentMemory"      ENABLE ROW LEVEL SECURITY;

-- ── Artifact ─────────────────────────────────────────────────────────────────
-- spaceId column exists directly on the table.

CREATE POLICY "artifact: space owner only"
  ON "Artifact"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

-- ── ArtifactVersion ──────────────────────────────────────────────────────────
-- spaceId is denormalised onto ArtifactVersion (added in the artifact migration).

CREATE POLICY "artifact_version: space owner only"
  ON "ArtifactVersion"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

-- ── DeadLetterEvent ───────────────────────────────────────────────────────────
-- spaceId column exists directly on the table.

CREATE POLICY "dead_letter_event: space owner only"
  ON "DeadLetterEvent"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

-- ── DisabledSpace ─────────────────────────────────────────────────────────────
-- spaceId column exists directly on the table.

CREATE POLICY "disabled_space: space owner only"
  ON "DisabledSpace"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

-- ── GoalDecomposition ─────────────────────────────────────────────────────────
-- spaceId column exists directly on the table.

CREATE POLICY "goal_decomposition: space owner only"
  ON "GoalDecomposition"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

-- ── TaskDependency ────────────────────────────────────────────────────────────
-- No direct spaceId column. Join through AgentTask to resolve the owning space.

CREATE POLICY "task_dependency: via task space owner"
  ON "TaskDependency"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "AgentTask" t
      WHERE t.id = "TaskDependency"."taskId"
        AND t."spaceId" IN (
          SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
        )
    )
  );

-- ── AgentActivityLog ──────────────────────────────────────────────────────────
-- spaceId column exists directly on the table.

CREATE POLICY "agent_activity_log: space owner only"
  ON "AgentActivityLog"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

-- ── AgentDraft ────────────────────────────────────────────────────────────────
-- spaceId column exists directly on the table.

CREATE POLICY "agent_draft: space owner only"
  ON "AgentDraft"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

-- ── AgentMemory ───────────────────────────────────────────────────────────────
-- spaceId column exists directly on the table.

CREATE POLICY "agent_memory: space owner only"
  ON "AgentMemory"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );
