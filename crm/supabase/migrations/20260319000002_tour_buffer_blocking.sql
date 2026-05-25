-- Buffer time between tours and manual date blocking
ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "tourBufferMinutes" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tourBlockedDates"  text[] NOT NULL DEFAULT '{}';

-- Track source of deal for tour→deal conversion analytics
ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "sourceTourId" text REFERENCES "Tour"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deal_source_tour ON "Deal" ("sourceTourId");
