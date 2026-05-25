-- Per-date availability overrides for tour scheduling.
-- Allows agents to set custom hours for specific dates or block them entirely.
-- When an override exists for a date, it takes priority over the default
-- SpaceSetting hours/days. If isBlocked = true, the entire day is unavailable.

CREATE TABLE IF NOT EXISTS "TourAvailabilityOverride" (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"   text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  date        date NOT NULL,
  "isBlocked" boolean NOT NULL DEFAULT false,
  "startHour" integer,  -- null when isBlocked = true
  "endHour"   integer,  -- null when isBlocked = true
  label       text,     -- optional label e.g. "Open house Saturday", "Vacation"
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_override_space_date
  ON "TourAvailabilityOverride" ("spaceId", date);

CREATE INDEX IF NOT EXISTS idx_override_space
  ON "TourAvailabilityOverride" ("spaceId");

ALTER TABLE "TourAvailabilityOverride" ENABLE ROW LEVEL SECURITY;
