-- Phase 6 of the deals redesign: close out the deferred polish.
--
-- Adds:
--   * wonLostReason + wonLostNote on Deal — the kanban already prompts for
--     these via a dialog but throws them away. This lets us keep the post-
--     mortem data for future analytics.
--   * kind on DealStage — a typed view of a stage so the health engine,
--     checklist seeder, and "Advance" logic can reason about "this stage is
--     where inspection happens" without depending on position. Nullable so
--     existing custom pipelines continue to work unchanged.

ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "wonLostReason" TEXT;

ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "wonLostNote" TEXT;

ALTER TABLE "DealStage"
  ADD COLUMN IF NOT EXISTS "kind" TEXT;

ALTER TABLE "DealStage"
  DROP CONSTRAINT IF EXISTS "DealStage_kind_check";

ALTER TABLE "DealStage"
  ADD CONSTRAINT "DealStage_kind_check"
  CHECK ("kind" IS NULL OR "kind" IN (
    'lead',
    'qualified',
    'active',
    'under_contract',
    'closing',
    'closed'
  ));

CREATE INDEX IF NOT EXISTS idx_deal_stage_kind
  ON "DealStage" ("spaceId", "kind")
  WHERE "kind" IS NOT NULL;
