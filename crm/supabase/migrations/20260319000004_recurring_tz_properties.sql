-- Feature 1: Recurring availability overrides
ALTER TABLE "TourAvailabilityOverride"
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'none'
    CHECK (recurrence IN ('none', 'weekly', 'biweekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS "endDate" date;

-- Feature 3: Multi-property scheduling profiles
CREATE TABLE IF NOT EXISTS "TourPropertyProfile" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"       text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  name            text NOT NULL,
  address         text,
  "tourDuration"  integer NOT NULL DEFAULT 30,
  "startHour"     integer NOT NULL DEFAULT 9,
  "endHour"       integer NOT NULL DEFAULT 17,
  "daysAvailable" integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  "bufferMinutes" integer NOT NULL DEFAULT 0,
  "isActive"      boolean NOT NULL DEFAULT true,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_profile_space
  ON "TourPropertyProfile" ("spaceId");

-- Link tours to a specific property profile
ALTER TABLE "Tour"
  ADD COLUMN IF NOT EXISTS "propertyProfileId" text REFERENCES "TourPropertyProfile"(id) ON DELETE SET NULL;

-- Link overrides to a specific property profile
ALTER TABLE "TourAvailabilityOverride"
  ADD COLUMN IF NOT EXISTS "propertyProfileId" text REFERENCES "TourPropertyProfile"(id) ON DELETE CASCADE;

ALTER TABLE "TourPropertyProfile" ENABLE ROW LEVEL SECURITY;
