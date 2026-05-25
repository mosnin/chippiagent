-- Migration: Add dual form config columns (rental + buyer)
-- Date: 2026-04-08
-- Description: The original form builder assumed one config per space. Now each space
--   needs separate rental and buyer form configs so the "Getting Started" step can
--   route applicants to the correct form. Legacy single `formConfig` column is kept
--   for backwards compatibility and treated as the rental config when present.

-- ============================================================
-- SpaceSetting: per-agent dual form configuration
-- ============================================================

-- Rental-specific form config (replaces the single formConfig for rental path)
ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "rentalFormConfig" jsonb DEFAULT NULL;

-- Buyer-specific form config
ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "buyerFormConfig" jsonb DEFAULT NULL;

-- ============================================================
-- Brokerage: brokerage-level dual form templates
-- ============================================================

-- Rental-specific brokerage template
ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "brokerageRentalFormConfig" jsonb DEFAULT NULL;

-- Buyer-specific brokerage template
ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "brokerageBuyerFormConfig" jsonb DEFAULT NULL;

-- ============================================================
-- Contact: which form path the applicant used
-- ============================================================

-- Stores which lead type path the applicant chose in "Getting Started"
ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "formLeadType" text DEFAULT NULL
    CHECK ("formLeadType" IN ('rental', 'buyer'));

-- ============================================================
-- Indexes
-- ============================================================

-- GIN indexes on new JSONB columns for containment queries
CREATE INDEX IF NOT EXISTS idx_space_setting_rental_form_config
  ON "SpaceSetting" USING gin("rentalFormConfig") WHERE "rentalFormConfig" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_space_setting_buyer_form_config
  ON "SpaceSetting" USING gin("buyerFormConfig") WHERE "buyerFormConfig" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_brokerage_rental_form_config
  ON "Brokerage" USING gin("brokerageRentalFormConfig") WHERE "brokerageRentalFormConfig" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_brokerage_buyer_form_config
  ON "Brokerage" USING gin("brokerageBuyerFormConfig") WHERE "brokerageBuyerFormConfig" IS NOT NULL;

-- Index for filtering contacts by form lead type
CREATE INDEX IF NOT EXISTS idx_contact_form_lead_type
  ON "Contact"("formLeadType") WHERE "formLeadType" IS NOT NULL;

-- ============================================================
-- Data migration: copy existing single formConfig to rentalFormConfig
-- ============================================================
-- Spaces that already have a custom formConfig with leadType='rental' (or 'general')
-- should have it copied to rentalFormConfig for seamless migration.
UPDATE "SpaceSetting"
  SET "rentalFormConfig" = "formConfig"
  WHERE "formConfig" IS NOT NULL
    AND "rentalFormConfig" IS NULL
    AND ("formConfig"->>'leadType' IS NULL
         OR "formConfig"->>'leadType' IN ('rental', 'general'));

-- Spaces that have a custom formConfig with leadType='buyer'
-- should have it copied to buyerFormConfig.
UPDATE "SpaceSetting"
  SET "buyerFormConfig" = "formConfig"
  WHERE "formConfig" IS NOT NULL
    AND "buyerFormConfig" IS NULL
    AND "formConfig"->>'leadType' = 'buyer';

-- Same for brokerage-level configs
UPDATE "Brokerage"
  SET "brokerageRentalFormConfig" = "brokerageFormConfig"
  WHERE "brokerageFormConfig" IS NOT NULL
    AND "brokerageRentalFormConfig" IS NULL
    AND ("brokerageFormConfig"->>'leadType' IS NULL
         OR "brokerageFormConfig"->>'leadType' IN ('rental', 'general'));

UPDATE "Brokerage"
  SET "brokerageBuyerFormConfig" = "brokerageFormConfig"
  WHERE "brokerageFormConfig" IS NOT NULL
    AND "brokerageBuyerFormConfig" IS NULL
    AND "brokerageFormConfig"->>'leadType' = 'buyer';
