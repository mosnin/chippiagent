-- ============================================================================
-- AuditLog table — persistent, append-only record of data mutations
-- ============================================================================
--
-- SOC 2 requires: "The entity retains audit logs for a minimum of one year."
-- (TSC CC7.3, CC9.2, A1.2)
--
-- This table captures who did what to which record, at what time.
-- Written by the service role only; never exposed to end-users.
-- Rows are intentionally immutable — no UPDATE or DELETE policies granted.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id"         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  -- Who performed the action (internal DB user id; null for public/unauthenticated)
  "actorId"    text,
  -- Clerk user id for the actor (for cross-referencing with Clerk dashboard)
  "clerkId"    text,
  -- IP address of the request (for access investigations)
  "ipAddress"  text,
  -- The action taken: CREATE, UPDATE, DELETE, ACCESS, LOGIN, etc.
  "action"     text        NOT NULL,
  -- The table/resource that was affected
  "resource"   text        NOT NULL,
  -- The id of the specific record affected
  "resourceId" text,
  -- The workspace (space) context for tenant scoping
  "spaceId"    text,
  -- Metadata — before/after state or other relevant context (JSON)
  "metadata"   jsonb,
  -- When the action occurred
  "createdAt"  timestamptz NOT NULL DEFAULT now()
);

-- Fast lookups by actor, resource, and time window
CREATE INDEX IF NOT EXISTS "audit_log_actor_idx"     ON "AuditLog" ("actorId");
CREATE INDEX IF NOT EXISTS "audit_log_resource_idx"  ON "AuditLog" ("resource", "resourceId");
CREATE INDEX IF NOT EXISTS "audit_log_space_idx"     ON "AuditLog" ("spaceId");
CREATE INDEX IF NOT EXISTS "audit_log_created_idx"   ON "AuditLog" ("createdAt" DESC);

-- ── RLS: AuditLog is write-only from the app's perspective ──────────────────
-- Service role bypasses RLS so the app can INSERT freely.
-- Authenticated and anon roles cannot read or modify audit logs.

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

-- No SELECT/UPDATE/DELETE policies — deny all non-service-role access.
-- (Absence of a permissive policy = deny by default under RLS.)
