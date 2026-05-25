-- Tour booking table for Calendly-style scheduling
CREATE TABLE IF NOT EXISTS "Tour" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"       text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "contactId"     text REFERENCES "Contact"(id) ON DELETE SET NULL,
  "guestName"     text NOT NULL,
  "guestEmail"    text NOT NULL,
  "guestPhone"    text,
  "propertyAddress" text,
  notes           text,
  "startsAt"      timestamptz NOT NULL,
  "endsAt"        timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  "googleEventId" text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tour_space_starts ON "Tour" ("spaceId", "startsAt" DESC);
CREATE INDEX IF NOT EXISTS idx_tour_contact      ON "Tour" ("contactId");
CREATE INDEX IF NOT EXISTS idx_tour_status       ON "Tour" (status);

-- Google Calendar OAuth tokens for the space owner
CREATE TABLE IF NOT EXISTS "GoogleCalendarToken" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"       text UNIQUE NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "accessToken"   text NOT NULL,
  "refreshToken"  text NOT NULL,
  "expiresAt"     timestamptz NOT NULL,
  "calendarId"    text NOT NULL DEFAULT 'primary',
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "Tour"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoogleCalendarToken"   ENABLE ROW LEVEL SECURITY;

-- Booking availability settings per space
ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "tourDuration"     integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "tourStartHour"    integer NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS "tourEndHour"      integer NOT NULL DEFAULT 17,
  ADD COLUMN IF NOT EXISTS "tourDaysAvailable" integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  ADD COLUMN IF NOT EXISTS "tourBookingPageTitle" text,
  ADD COLUMN IF NOT EXISTS "tourBookingPageIntro" text;
