-- Branding: logo URL and realtor profile picture for public pages
ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "logoUrl" text,
  ADD COLUMN IF NOT EXISTS "realtorPhotoUrl" text;

-- Lead source attribution: track how contacts entered the system
ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "sourceLabel" text,
  ADD COLUMN IF NOT EXISTS "sourceTourId" text REFERENCES "Tour"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "followUpAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "lastContactedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "stageChangedAt" timestamptz;

-- Note: sourceLabel, followUpAt, lastContactedAt, stageChangedAt may already exist
-- from previous migrations. The IF NOT EXISTS handles this gracefully.
