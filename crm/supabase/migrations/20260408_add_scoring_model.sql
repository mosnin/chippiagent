-- Add AI-generated scoring model columns to SpaceSetting and Brokerage
-- These store the scoring models separately from the form configs

-- Space-level scoring models (per agent)
ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "rentalScoringModel" jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "buyerScoringModel" jsonb DEFAULT NULL;

-- Brokerage-level scoring models (inherited by members)
ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "brokerageRentalScoringModel" jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "brokerageBuyerScoringModel" jsonb DEFAULT NULL;

COMMENT ON COLUMN "SpaceSetting"."rentalScoringModel" IS 'AI-generated scoring model for rental intake form. JSON matches ScoringModel type.';
COMMENT ON COLUMN "SpaceSetting"."buyerScoringModel" IS 'AI-generated scoring model for buyer intake form. JSON matches ScoringModel type.';
COMMENT ON COLUMN "Brokerage"."brokerageRentalScoringModel" IS 'Brokerage-wide default scoring model for rental forms.';
COMMENT ON COLUMN "Brokerage"."brokerageBuyerScoringModel" IS 'Brokerage-wide default scoring model for buyer forms.';
