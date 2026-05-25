-- ============================================================================
-- Deal.stageChangedAt — track when a Deal moved to its current stage.
--
-- Code referenced this column on Deal in two places:
--   - lib/ai-tools/tools/find-deal.ts (the find_deal agent tool)
--   - app/api/cron/draft-outcomes/route.ts (draft-outcome classifier)
-- but the column only existed on Contact (added in 20260316000004), so both
-- paths failed with `column Deal.stageChangedAt does not exist`. The chat
-- error was visible to the realtor on the first deal-adjacent question.
--
-- The corresponding Deal write site is the deal-update API, which sets
-- stageChangedAt to now() whenever stageId changes (analogous to the existing
-- Contact behaviour).
-- ============================================================================

ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "stageChangedAt" timestamptz;

-- Backfill for existing rows so daysInStage isn't null forever — use
-- updatedAt as a best-guess proxy. New stage moves will set the column
-- explicitly going forward.
UPDATE "Deal"
   SET "stageChangedAt" = "updatedAt"
 WHERE "stageChangedAt" IS NULL;
