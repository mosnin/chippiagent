-- Remove per-space Anthropic API key storage (unencrypted, no longer used).
ALTER TABLE "SpaceSetting" DROP COLUMN IF EXISTS "anthropicApiKey";
