-- Add missing appearance and content columns to SpaceSetting
-- These were referenced in code but never existed in the schema

ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "intakeDarkMode"          boolean DEFAULT false;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "intakeHeaderBgColor"     text;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "intakeHeaderGradient"    text;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "intakeFaviconUrl"       text;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "intakeVideoUrl"         text;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "intakeThankYouTitle"    text;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "intakeThankYouMessage"  text;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "intakeConfirmationEmail" text;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "intakeDisclaimerText"   text;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "logoUrl"               text;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "realtorPhotoUrl"       text;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "intakeDisabledSteps"   jsonb;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "intakeCustomQuestions"  jsonb;
