-- Migration: Add dynamic form builder columns
-- Date: 2026-04-08
-- Description: Adds JSONB columns for dynamic intake form configuration to
--   SpaceSetting (per-agent custom forms), Brokerage (brokerage-level templates),
--   and Contact (frozen snapshot of the form config used at submission time).
--   Null formConfig means "use legacy hardcoded form" for full backwards compatibility.

-- ============================================================
-- SpaceSetting: per-agent form configuration
-- ============================================================

-- The full IntakeFormConfig JSON (sections, questions, scoring, etc.)
-- NULL = use legacy hardcoded form
ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "formConfig" jsonb DEFAULT NULL;

-- Where the form config came from: 'custom' (agent built it), 'brokerage'
-- (inherited from brokerage template), or 'legacy' (hardcoded form)
ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "formConfigSource" text NOT NULL DEFAULT 'legacy'
    CHECK ("formConfigSource" IN ('custom', 'brokerage', 'legacy'));

-- ============================================================
-- Brokerage: brokerage-level form template
-- ============================================================

-- Brokerages can define a template form that member agents inherit
ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "brokerageFormConfig" jsonb DEFAULT NULL;

-- ============================================================
-- Contact: frozen form config snapshot at submission time
-- ============================================================

-- Stores the exact form config version used when the lead submitted,
-- so we can always reconstruct what they were asked even if the form changes later
ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "formConfigSnapshot" jsonb DEFAULT NULL;

-- ============================================================
-- Indexes
-- ============================================================

-- Index on formConfigSource for filtering spaces by config type
CREATE INDEX IF NOT EXISTS idx_space_setting_form_config_source
  ON "SpaceSetting"("formConfigSource");

-- GIN index on formConfig for JSONB containment queries (e.g. finding forms by version)
CREATE INDEX IF NOT EXISTS idx_space_setting_form_config
  ON "SpaceSetting" USING gin("formConfig") WHERE "formConfig" IS NOT NULL;

-- GIN index on brokerageFormConfig for JSONB queries
CREATE INDEX IF NOT EXISTS idx_brokerage_form_config
  ON "Brokerage" USING gin("brokerageFormConfig") WHERE "brokerageFormConfig" IS NOT NULL;
