-- Notes: Notion-like pages with rich text content

CREATE TABLE IF NOT EXISTS "Note" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId" text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "title" text NOT NULL DEFAULT 'Untitled',
  "content" text NOT NULL DEFAULT '',
  "icon" text,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_note_space ON "Note" ("spaceId", "sortOrder");

ALTER TABLE "Note" ENABLE ROW LEVEL SECURITY;
