-- CustomAgent, SwarmRun, SwarmMember, and SwarmEvent tables for the swarm
-- execution system.
--
-- These four tables back the multi-agent swarm layer:
--
--   CustomAgent  — user-defined AI agents with custom prompts, models, and
--                  capability declarations. Scoped to a Space so each tenant
--                  maintains their own agent library.
--
--   SwarmRun     — a single swarm execution triggered by a high-level goal.
--                  Tracks overall status, the planner-generated plan (jsonb),
--                  the final result, and accumulated cost so the owner can
--                  audit what the swarm spent.
--
--   SwarmMember  — one agent instance participating in a swarm run. Each
--                  member is assigned a task and a wave number (for parallel
--                  wave execution), and records its own output and cost share.
--                  Links back to the CustomAgent definition it was cloned from
--                  (nullable — SET NULL if the source agent is later deleted).
--
--   SwarmEvent   — append-only event log emitted during a run. Used as the
--                  backing store for SSE streaming to the client. Each row
--                  carries a typed event payload (jsonb) so the consumer can
--                  fan out to the right handler without schema changes.
--
-- Idempotent: IF NOT EXISTS guards throughout. Safe to re-run.

-- ── CustomAgent ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CustomAgent" (
  "id"            text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"       text        NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "name"          text        NOT NULL,
  "description"   text,
  "systemPrompt"  text        NOT NULL DEFAULT '',
  "model"         text        NOT NULL DEFAULT 'gpt-4o-mini',
  "capabilities"  jsonb       NOT NULL DEFAULT '[]',
  "isActive"      boolean     NOT NULL DEFAULT true,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

-- Primary access pattern: list agents for a space.
CREATE INDEX IF NOT EXISTS "CustomAgent_spaceId_idx"
  ON "CustomAgent" ("spaceId");

-- ── SwarmRun ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "SwarmRun" (
  "id"              text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"         text        NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "goal"            text        NOT NULL,
  "status"          text        NOT NULL DEFAULT 'queued'
                      CHECK ("status" IN ('queued','planning','running','auditing','completed','failed','cancelled')),
  "plan"            jsonb,
  "result"          text,
  "errorMessage"    text,
  "totalCostCents"  integer     NOT NULL DEFAULT 0,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "completedAt"     timestamptz
);

-- Primary access pattern: list runs for a space ordered by recency.
CREATE INDEX IF NOT EXISTS "SwarmRun_spaceId_createdAt_idx"
  ON "SwarmRun" ("spaceId", "createdAt" DESC);

-- ── SwarmMember ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "SwarmMember" (
  "id"            text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "swarmRunId"    text        NOT NULL REFERENCES "SwarmRun"(id) ON DELETE CASCADE,
  -- SET NULL so member rows survive for audit purposes if the source agent is
  -- deleted after the run was created.
  "customAgentId" text        REFERENCES "CustomAgent"(id) ON DELETE SET NULL,
  "name"          text        NOT NULL,
  "role"          text,
  "systemPrompt"  text        NOT NULL DEFAULT '',
  "task"          text        NOT NULL,
  "status"        text        NOT NULL DEFAULT 'queued'
                    CHECK ("status" IN ('queued','running','completed','failed')),
  "output"        text,
  "wave"          integer     NOT NULL DEFAULT 1,
  "costCents"     integer     NOT NULL DEFAULT 0,
  "startedAt"     timestamptz,
  "completedAt"   timestamptz,
  "createdAt"     timestamptz NOT NULL DEFAULT now()
);

-- Member list within a run.
CREATE INDEX IF NOT EXISTS "SwarmMember_swarmRunId_idx"
  ON "SwarmMember" ("swarmRunId");

-- ── SwarmEvent ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "SwarmEvent" (
  "id"          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "swarmRunId"  text        NOT NULL REFERENCES "SwarmRun"(id) ON DELETE CASCADE,
  -- SET NULL so event rows survive for audit purposes if the member is deleted.
  "memberId"    text        REFERENCES "SwarmMember"(id) ON DELETE SET NULL,
  "type"        text        NOT NULL,
  "data"        jsonb       NOT NULL DEFAULT '{}',
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);

-- Event timeline within a run (ascending for SSE replay).
CREATE INDEX IF NOT EXISTS "SwarmEvent_swarmRunId_createdAt_idx"
  ON "SwarmEvent" ("swarmRunId", "createdAt" ASC);

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- The app uses the service role key (which bypasses RLS), so these policies
-- guard against direct PostgREST / anon-role access only. Pattern matches the
-- existing spaceId-scoped policies throughout this codebase.
--
-- CustomAgent and SwarmRun carry a direct spaceId column — policy is a simple
-- IN subquery.  SwarmMember and SwarmEvent have no direct spaceId column, so
-- they resolve ownership by joining through SwarmRun via EXISTS.

ALTER TABLE "CustomAgent"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SwarmRun"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SwarmMember"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SwarmEvent"   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_agent: space owner only"
  ON "CustomAgent"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

CREATE POLICY "swarm_run: space owner only"
  ON "SwarmRun"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

CREATE POLICY "swarm_member: via swarm run space owner"
  ON "SwarmMember"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "SwarmRun" r
      WHERE r.id = "SwarmMember"."swarmRunId"
        AND r."spaceId" IN (
          SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
        )
    )
  );

CREATE POLICY "swarm_event: via swarm run space owner"
  ON "SwarmEvent"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "SwarmRun" r
      WHERE r.id = "SwarmEvent"."swarmRunId"
        AND r."spaceId" IN (
          SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
        )
    )
  );
