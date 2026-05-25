-- Custom calendar events added manually by users
CREATE TABLE IF NOT EXISTS "CalendarEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId" text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "date" date NOT NULL,
  "time" text,
  "color" text DEFAULT 'gray',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_event_space ON "CalendarEvent" ("spaceId", "date");
ALTER TABLE "CalendarEvent" ENABLE ROW LEVEL SECURITY;
