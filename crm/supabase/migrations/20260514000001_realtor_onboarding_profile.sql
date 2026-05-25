-- Extend AIUserProfile with the fields captured by the new realtor onboarding:
--   role          — solo agent / team lead / brokerage owner
--   zipCode       — primary market ZIP, used by Chippi for market context
--   leadSources   — channels the realtor uses to acquire leads (zillow, facebook, …)
--
-- AIUserProfile already covers businessFocus, yearsExperience, communicationTone,
-- quirksAndPreferences — those map to the rest of the new flow. We're only adding
-- the three fields the existing schema doesn't represent.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS throughout. Safe to re-run.

ALTER TABLE "AIUserProfile" ADD COLUMN IF NOT EXISTS "role"        text;
ALTER TABLE "AIUserProfile" ADD COLUMN IF NOT EXISTS "zipCode"     text;
ALTER TABLE "AIUserProfile" ADD COLUMN IF NOT EXISTS "leadSources" text[] NOT NULL DEFAULT '{}';
