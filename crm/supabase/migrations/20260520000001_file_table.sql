-- ═══════════════════════════════════════════════════════════════════════════
-- File table — generic, space-scoped file storage.
--
-- Distinct from ContactDocument, DealDocument, Attachment: those tables
-- carry domain-specific metadata (which deal, which contact, which chat).
-- This is the user-facing "Files" page surface — anything the realtor
-- uploaded without attaching to a specific record.
--
-- Files land in Wasabi at `files/{spaceId}/{uuid}-{filename}`. The
-- `storageKey` column carries the full key (including the prefix) so
-- lookups don't have to re-derive it from spaceId + name.
--
-- Limits enforced in the API, not via DB constraints — the constraints
-- would require a migration every time a plan tier changes.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "File" (
  "id"            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"       text NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "userId"        text NOT NULL,                -- Clerk userId who uploaded
  "storageKey"    text NOT NULL UNIQUE,         -- Wasabi object key
  "name"          text NOT NULL,                -- Original filename
  "mimeType"      text NOT NULL,
  "category"      text NOT NULL,                -- 'image' | 'document' | 'video' | 'audio' | 'other'
  "sizeBytes"     bigint NOT NULL CHECK ("sizeBytes" >= 0),
  "isPublic"      boolean NOT NULL DEFAULT false,
  "createdAt"     timestamptz NOT NULL DEFAULT now()
);

-- Hot path: realtor's Files page query → spaceId + recency.
CREATE INDEX IF NOT EXISTS "File_spaceId_createdAt_idx"
  ON "File" ("spaceId", "createdAt" DESC);

-- Filter by category (tabs on the page).
CREATE INDEX IF NOT EXISTS "File_spaceId_category_idx"
  ON "File" ("spaceId", "category", "createdAt" DESC);

-- Per-user quota query for brokerages (multiple realtors share a Space).
CREATE INDEX IF NOT EXISTS "File_userId_createdAt_idx"
  ON "File" ("userId", "createdAt" DESC);

-- RLS — same shape as every other space-scoped table.
ALTER TABLE "File" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "file_owner_select"
  ON "File" FOR SELECT
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

CREATE POLICY "file_owner_insert"
  ON "File" FOR INSERT
  WITH CHECK (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

CREATE POLICY "file_owner_delete"
  ON "File" FOR DELETE
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );
