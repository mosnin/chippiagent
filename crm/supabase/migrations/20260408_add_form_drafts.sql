-- Migration: Add FormDraft table for server-side auto-save with magic link resume
-- Allows applicants to save form progress server-side and resume via emailed magic link

CREATE TABLE IF NOT EXISTS "FormDraft" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "spaceId"           text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  email               text NOT NULL,
  "resumeToken"       text NOT NULL UNIQUE,
  answers             jsonb NOT NULL DEFAULT '{}',
  "currentStep"       integer NOT NULL DEFAULT 0,
  "formConfigVersion" integer,
  "expiresAt"         timestamptz NOT NULL,
  "completedAt"       timestamptz,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz NOT NULL DEFAULT now()
);

-- Index for fast token lookup (magic link resume)
CREATE INDEX IF NOT EXISTS idx_form_draft_resume_token
  ON "FormDraft"("resumeToken");

-- Composite index for upsert lookup (find existing draft for same space + email)
CREATE INDEX IF NOT EXISTS idx_form_draft_space_email
  ON "FormDraft"("spaceId", email);

-- Index for expired draft cleanup
CREATE INDEX IF NOT EXISTS idx_form_draft_expires_at
  ON "FormDraft"("expiresAt");

-- Enable RLS (service_role key bypasses it; protects against anon/authenticated key leaks)
ALTER TABLE "FormDraft" ENABLE ROW LEVEL SECURITY;
