-- Calendar notes: short free-text notes attached to a specific date
CREATE TABLE IF NOT EXISTS "CalendarNote" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId" text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "date" date NOT NULL,
  "note" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_note_space_date ON "CalendarNote" ("spaceId", "date");
ALTER TABLE "CalendarNote" ENABLE ROW LEVEL SECURITY;
