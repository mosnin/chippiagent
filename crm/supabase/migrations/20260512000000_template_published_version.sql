-- ============================================================================
-- BP6 audit follow-up: track publishedVersion on BrokerageTemplate
-- ============================================================================
-- The UI was inferring "up to date vs edited since last publish" by comparing
-- `updatedAt` against `publishedAt` with a 1-second slack. That was
-- unreliable: a PATCH within 1s of a publish reads as green; a clock skew
-- of more than 1s reads as amber. The correct signal is the version that
-- was actually pushed. Adding a column lets the client compare version
-- equality directly, which is unambiguous.
--
-- Backfill semantics: existing rows that have publishedAt IS NOT NULL
-- almost certainly have not been edited since that publish (the UI that
-- showed them already relied on the timestamp slack); we assume their
-- current version IS the published version. New rows default publishedVersion
-- to NULL so fresh-and-unpublished rows stay distinguishable from
-- pushed-and-untouched rows.
-- ============================================================================

ALTER TABLE "BrokerageTemplate"
  ADD COLUMN IF NOT EXISTS "publishedVersion" integer;

-- Backfill existing rows: the version that was pushed = the current version
-- (nothing's edited between that publish and this migration).
UPDATE "BrokerageTemplate"
   SET "publishedVersion" = version
 WHERE "publishedAt" IS NOT NULL
   AND "publishedVersion" IS NULL;
