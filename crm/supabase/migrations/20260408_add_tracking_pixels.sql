-- Add tracking pixels JSONB column to SpaceSetting
-- Stores pixel IDs for Meta/Facebook, TikTok, Google Analytics, Google Ads,
-- Twitter/X, LinkedIn, Snapchat, and a custom head script field.

ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "trackingPixels" JSONB;
