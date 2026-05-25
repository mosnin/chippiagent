-- Chat attachments: files the realtor uploads via the prompt box.
-- Owned by spaceId; the cowork agent reads them via the read_attachment tool.

CREATE TABLE IF NOT EXISTS "Attachment" (
  id              TEXT PRIMARY KEY,
  "spaceId"       TEXT NOT NULL,
  "userId"        TEXT,
  "conversationId" TEXT,
  filename        TEXT NOT NULL,
  "mimeType"      TEXT NOT NULL,
  "sizeBytes"     INT NOT NULL,
  "storagePath"   TEXT NOT NULL,
  "publicUrl"     TEXT NOT NULL,
  "extractedText" TEXT,
  "extractionStatus" TEXT NOT NULL DEFAULT 'pending'
    CHECK ("extractionStatus" IN ('pending','skipped','done','failed')),
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "Attachment_spaceId_createdAt_idx"
  ON "Attachment" ("spaceId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Attachment_conversationId_idx"
  ON "Attachment" ("conversationId")
  WHERE "conversationId" IS NOT NULL;
