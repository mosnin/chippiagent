-- Buyer lead support

-- Contact: lead type (rental or buyer)
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "leadType" text DEFAULT 'rental'
  CHECK ("leadType" IN ('rental', 'buyer'));

-- DealStage: pipeline type so rental and buyer stages are separate
ALTER TABLE "DealStage" ADD COLUMN IF NOT EXISTS "pipelineType" text DEFAULT 'rental'
  CHECK ("pipelineType" IN ('rental', 'buyer'));

-- Index for filtering by lead type
CREATE INDEX IF NOT EXISTS idx_contact_lead_type ON "Contact" ("spaceId", "leadType");
CREATE INDEX IF NOT EXISTS idx_deal_stage_pipeline ON "DealStage" ("spaceId", "pipelineType");
