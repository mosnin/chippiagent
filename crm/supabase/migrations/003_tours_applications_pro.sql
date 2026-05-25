-- Migration: Add tables for tour feedback, cancel tokens, and application status tracking
-- Run in Supabase SQL Editor

-- Tour feedback from guests after completed tours
CREATE TABLE IF NOT EXISTS "TourFeedback" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tourId"        text UNIQUE NOT NULL REFERENCES "Tour"(id) ON DELETE CASCADE,
  "spaceId"       text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  rating          integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment         text,
  "createdAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tour_feedback_tour ON "TourFeedback" ("tourId");
CREATE INDEX IF NOT EXISTS idx_tour_feedback_space ON "TourFeedback" ("spaceId");

ALTER TABLE "TourFeedback" ENABLE ROW LEVEL SECURITY;

-- Tour manage tokens for guest self-service cancel/reschedule
ALTER TABLE "Tour" ADD COLUMN IF NOT EXISTS "manageToken" text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_tour_manage_token ON "Tour" ("manageToken");

-- Application status tracking
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "applicationStatus" text NOT NULL DEFAULT 'received'
  CHECK ("applicationStatus" IN ('received', 'under_review', 'approved', 'needs_info', 'declined'));
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "applicationStatusNote" text;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "applicationRef" text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_contact_app_ref ON "Contact" ("applicationRef");

-- Document uploads for applications
CREATE TABLE IF NOT EXISTS "ContactDocument" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "contactId"     text NOT NULL REFERENCES "Contact"(id) ON DELETE CASCADE,
  "spaceId"       text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "fileName"      text NOT NULL,
  "fileType"      text NOT NULL,
  "fileSize"      integer NOT NULL,
  "storageKey"    text NOT NULL,
  "uploadedBy"    text NOT NULL DEFAULT 'guest',
  "createdAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_document_contact ON "ContactDocument" ("contactId");
ALTER TABLE "ContactDocument" ENABLE ROW LEVEL SECURITY;
