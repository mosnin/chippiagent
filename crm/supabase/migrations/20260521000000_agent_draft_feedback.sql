-- Per-draft feedback signal on AgentDraft.
--
-- Today the only signal we have on a draft is its terminal `status`
-- (pending / approved / dismissed / sent). That tells us whether a draft
-- moved, but not WHY:
--   - Did the realtor approve it as written, or rewrite half of it?
--   - How long did the decision take? (10 seconds = trust; 4 minutes = doubt.)
--   - Was a "dismissed" draft a hold, or a flat reject?
--
-- Without that, every prompt change is guessing. This migration adds three
-- additive columns that the FocusCard PATCH path will populate. Existing
-- rows stay NULL — no backfill, no downtime.
--
-- Idempotent: IF NOT EXISTS guards. Safe to re-run.

ALTER TABLE "AgentDraft"
  ADD COLUMN IF NOT EXISTS "feedback_action" TEXT
    CHECK ("feedback_action" IN ('approved','edited_and_approved','rejected','held')),
  ADD COLUMN IF NOT EXISTS "edit_distance"   INTEGER
    CHECK ("edit_distance" >= 0),
  ADD COLUMN IF NOT EXISTS "decision_ms"     INTEGER
    CHECK ("decision_ms" >= 0);

-- Cheap index for the "approval rate over the last N drafts" query.
CREATE INDEX IF NOT EXISTS "AgentDraft_spaceId_feedback_action_idx"
  ON "AgentDraft" ("spaceId", "feedback_action", "createdAt" DESC)
  WHERE "feedback_action" IS NOT NULL;
