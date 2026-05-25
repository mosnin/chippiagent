-- Brokerage-level trust signals: optional compliance slots set once by a
-- brokerage admin and inherited by every linked space's /apply/b/[id] intake.
-- Per-space SpaceSetting values take a back seat to these when the intake
-- is served via the brokerage variant — brokerage policy beats per-agent
-- copy for legal text.
--
--   brokerageLicenseNumber       — brokerage-level real-estate license #
--   brokerageFairHousingNotice   — multi-line Fair Housing statement
--   brokerageShowEqualHousingMark — render the Equal Housing Opportunity logo

ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "brokerageLicenseNumber" text,
  ADD COLUMN IF NOT EXISTS "brokerageFairHousingNotice" text,
  ADD COLUMN IF NOT EXISTS "brokerageShowEqualHousingMark" boolean NOT NULL DEFAULT false;
