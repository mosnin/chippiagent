-- Phase 3 of the deals redesign: make "next action" a first-class field.
--
-- Before this, the kanban card's "Next: …" line was inferred from
-- followUpAt/closeDate. Inference is fine as a fallback but realtors want to
-- state their actual next step explicitly ("Confirm inspection with John",
-- "Email lender for loan status"). Having a real column means:
--   * the Today inbox can surface overdue next actions across the pipeline
--   * the text is editable and persisted per-deal
--   * Phase 4's role-based contacts can auto-populate it
--
-- Keeping `followUpAt` separate on purpose — it's a general "reach out again"
-- reminder that may or may not be tied to a specific next step.

ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "nextAction" TEXT;

ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "nextActionDueAt" TIMESTAMPTZ;

-- Partial index — the Today inbox asks for overdue next actions scoped to a
-- space, so the typical query is (spaceId, nextActionDueAt) filtered to
-- active deals. Narrow the index to rows that actually have a next action.
CREATE INDEX IF NOT EXISTS idx_deal_next_action_due
  ON "Deal" ("spaceId", "nextActionDueAt")
  WHERE "nextAction" IS NOT NULL;
