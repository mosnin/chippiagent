-- Data retention: automatic pruning of stale agentic system rows.
--
-- Registers a single Postgres function, cleanup_agent_data(), that the
-- Vercel Cron job at /api/cron/cleanup calls once per day (03:00 UTC).
--
-- Design constraints:
--   - All deletes are capped at LIMIT 1000 per table per invocation to
--     avoid long-held locks and large WAL spikes. Multiple cron runs will
--     drain backlogs without a single blocking transaction.
--   - Function is CREATE OR REPLACE — idempotent; safe to re-run the
--     migration or deploy multiple times.
--   - No schema changes: all tables already exist from prior migrations.
--
-- Retention windows:
--   ExecutionStep        > 30 days  (by startedAt; fallback createdAt)
--   AgentTask (terminal) > 90 days  (completed / failed / cancelled)
--   AgentMemory          expired    (expiresAt IS NOT NULL AND expiresAt < NOW())
--   ArtifactVersion      linked to tasks > 90 days old
--   Artifact             linked to tasks > 90 days old (after versions purged)

CREATE OR REPLACE FUNCTION cleanup_agent_data()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_steps     int;
  deleted_tasks     int;
  deleted_memories  int;
  deleted_versions  int;
  deleted_artifacts int;
BEGIN
  -- ── ExecutionStep: rows whose task started > 30 days ago ─────────────────
  -- Uses startedAt as the age signal; falls back to createdAt when startedAt
  -- is NULL (queued steps on a task that never ran).
  DELETE FROM "ExecutionStep"
  WHERE id IN (
    SELECT id FROM "ExecutionStep"
    WHERE COALESCE("startedAt", "createdAt") < NOW() - INTERVAL '30 days'
    LIMIT 1000
  );
  GET DIAGNOSTICS deleted_steps = ROW_COUNT;

  -- ── AgentTask: terminal tasks older than 90 days ──────────────────────────
  -- Only touches completed / failed / cancelled rows so in-flight tasks are
  -- never accidentally deleted. Sub-task children have parentTaskId set to
  -- NULL on parent deletion (ON DELETE SET NULL) and will be swept on a
  -- subsequent invocation once they themselves age out.
  DELETE FROM "AgentTask"
  WHERE id IN (
    SELECT id FROM "AgentTask"
    WHERE status IN ('completed', 'failed', 'cancelled')
      AND "createdAt" < NOW() - INTERVAL '90 days'
    LIMIT 1000
  );
  GET DIAGNOSTICS deleted_tasks = ROW_COUNT;

  -- ── AgentMemory: explicitly expired rows ─────────────────────────────────
  -- The Python prune_expired() RPC already handles this path; this function
  -- ensures cleanup happens even when the Python worker is not running.
  DELETE FROM "AgentMemory"
  WHERE id IN (
    SELECT id FROM "AgentMemory"
    WHERE "expiresAt" IS NOT NULL
      AND "expiresAt" < NOW()
    LIMIT 1000
  );
  GET DIAGNOSTICS deleted_memories = ROW_COUNT;

  -- ── ArtifactVersion: versions tied to old tasks ───────────────────────────
  -- Must precede Artifact deletion: Artifact.currentVersionId FK is deferrable
  -- but we clear versions first to keep the cascade clean.
  DELETE FROM "ArtifactVersion"
  WHERE id IN (
    SELECT av.id
    FROM "ArtifactVersion" av
    JOIN "Artifact"  a  ON av."artifactId" = a.id
    JOIN "AgentTask" at ON a."taskId"      = at.id
    WHERE at."createdAt" < NOW() - INTERVAL '90 days'
    LIMIT 1000
  );
  GET DIAGNOSTICS deleted_versions = ROW_COUNT;

  -- ── Artifact: orphaned by old tasks ──────────────────────────────────────
  -- taskId is SET NULL on AgentTask deletion, so this join only catches
  -- artifacts whose parent task still exists but is aged out. Artifacts
  -- whose parent was already deleted (taskId IS NULL) are out of scope —
  -- they require a separate age-column policy and are intentionally skipped.
  DELETE FROM "Artifact"
  WHERE id IN (
    SELECT a.id
    FROM "Artifact"  a
    JOIN "AgentTask" at ON a."taskId" = at.id
    WHERE at."createdAt" < NOW() - INTERVAL '90 days'
    LIMIT 1000
  );
  GET DIAGNOSTICS deleted_artifacts = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_steps',             deleted_steps,
    'deleted_tasks',             deleted_tasks,
    'deleted_memories',          deleted_memories,
    'deleted_artifact_versions', deleted_versions,
    'deleted_artifacts',         deleted_artifacts,
    'ran_at',                    NOW()
  );
END;
$$;
