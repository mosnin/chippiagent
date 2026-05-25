-- Add privacyPolicyHtml column to SpaceSetting and Brokerage tables
-- Stores rich-text (HTML) privacy policy content

ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "privacyPolicyHtml" text;

ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "privacyPolicyHtml" text;
