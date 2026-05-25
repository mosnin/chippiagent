-- ============================================================================
-- Performance indexes — prevent full-table scans on common query patterns
-- ============================================================================
--
-- Missing compound indexes cause sequential scans at scale, which can be
-- exploited as a DoS vector: a single authenticated request touching a
-- large table without an index will hold a lock and degrade all other queries.
--
-- All indexes below are CONCURRENTLY safe (no table lock) and IF NOT EXISTS
-- (idempotent / safe to re-run).
-- ============================================================================

-- ── Contact: common query pattern is spaceId + createdAt (sorted list) ──────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "contact_space_created_idx"
  ON "Contact" ("spaceId", "createdAt" DESC);

-- ── Contact: tag filtering (contacts page excludes 'application-link') ───────
-- The schema already has a GIN index on tags from schema.sql, keep as-is.

-- ── Contact: leads endpoint filters by spaceId AND checks tags ──────────────
-- Covered by the GIN + spaceId index above; no additional index needed.

-- ── Contact: scoring status filter used in admin repair flows ────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "contact_scoring_status_idx"
  ON "Contact" ("spaceId", "scoringStatus");

-- ── Deal: common query is spaceId + position (ordered kanban) ───────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "deal_space_position_idx"
  ON "Deal" ("spaceId", "position");

-- ── Deal: stage + position (used when reordering within a stage) ─────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "deal_stage_position_idx"
  ON "Deal" ("stageId", "position");

-- ── DealContact: reverse lookup — find deals for a contact ───────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "deal_contact_contact_idx"
  ON "DealContact" ("contactId");

-- ── Message: conversation history ordered by time per space ──────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "message_space_created_idx"
  ON "Message" ("spaceId", "createdAt" ASC);

-- ── DocumentEmbedding: entity lookup ─────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "embedding_entity_idx"
  ON "DocumentEmbedding" ("entityType", "entityId");

-- ── AuditLog: compound index for common investigation queries ────────────────
-- (actor + time, resource + time, space + time)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_actor_created_idx"
  ON "AuditLog" ("clerkId", "createdAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_resource_created_idx"
  ON "AuditLog" ("resource", "resourceId", "createdAt" DESC);
