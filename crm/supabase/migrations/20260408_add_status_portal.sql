-- Migration: Add status portal tables and columns
-- Supports the applicant-facing status portal with messaging and status history

-- ============================================================
-- New column on Contact for secure portal access
-- ============================================================

ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "statusPortalToken" text UNIQUE;

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_contact_status_portal_token
  ON "Contact"("statusPortalToken") WHERE "statusPortalToken" IS NOT NULL;

-- Index for applicationRef lookups (used by portal GET)
CREATE INDEX IF NOT EXISTS idx_contact_application_ref
  ON "Contact"("applicationRef") WHERE "applicationRef" IS NOT NULL;

-- ============================================================
-- ApplicationMessage: messages between applicant and realtor
-- ============================================================

CREATE TABLE IF NOT EXISTS "ApplicationMessage" (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contactId" text NOT NULL REFERENCES "Contact"(id) ON DELETE CASCADE,
  "spaceId"   text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "senderType" text NOT NULL CHECK ("senderType" IN ('applicant', 'realtor')),
  content     text NOT NULL CHECK (char_length(content) <= 2000),
  "readAt"    timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_message_contact
  ON "ApplicationMessage"("contactId", "createdAt" ASC);
CREATE INDEX IF NOT EXISTS idx_app_message_space
  ON "ApplicationMessage"("spaceId");
CREATE INDEX IF NOT EXISTS idx_app_message_unread
  ON "ApplicationMessage"("contactId", "readAt") WHERE "readAt" IS NULL;

ALTER TABLE "ApplicationMessage" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ApplicationStatusUpdate: audit trail for status changes
-- ============================================================

CREATE TABLE IF NOT EXISTS "ApplicationStatusUpdate" (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contactId" text NOT NULL REFERENCES "Contact"(id) ON DELETE CASCADE,
  "spaceId"   text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "fromStatus" text,
  "toStatus"  text NOT NULL,
  note        text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_status_update_contact
  ON "ApplicationStatusUpdate"("contactId", "createdAt" ASC);
CREATE INDEX IF NOT EXISTS idx_app_status_update_space
  ON "ApplicationStatusUpdate"("spaceId");

ALTER TABLE "ApplicationStatusUpdate" ENABLE ROW LEVEL SECURITY;
