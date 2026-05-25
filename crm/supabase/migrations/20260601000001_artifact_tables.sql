-- Artifact + ArtifactVersion: versioned output surfaces for the agentic system.
-- AgentTask and ExecutionStep are created in 20260601000000 which runs before this.

CREATE TABLE IF NOT EXISTS "Artifact" (
  "id"               text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"          text        NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "taskId"           text        REFERENCES "AgentTask"(id) ON DELETE SET NULL,
  "stepId"           text        REFERENCES "ExecutionStep"(id) ON DELETE SET NULL,
  "artifactType"     text        NOT NULL CHECK ("artifactType" IN (
                                   'draft_email','draft_sms','deal_update','contact_update',
                                   'tour_booking','goal_plan','report','raw_output')),
  "title"            text        NOT NULL,
  "contentType"      text        NOT NULL DEFAULT 'text/plain',
  "status"           text        NOT NULL DEFAULT 'draft' CHECK ("status" IN (
                                   'draft','approved','rejected','superseded')),
  "currentVersionId" text,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ArtifactVersion" (
  "id"              text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "artifactId"      text        NOT NULL REFERENCES "Artifact"(id) ON DELETE CASCADE,
  "spaceId"         text        NOT NULL,
  "versionNumber"   int         NOT NULL DEFAULT 1,
  "content"         text        NOT NULL,
  "contentHash"     text        NOT NULL,
  "metadata"        jsonb       DEFAULT '{}',
  "createdByAgent"  text        NOT NULL DEFAULT 'chippi',
  "createdAt"       timestamptz NOT NULL DEFAULT now()
);

-- Add FK after ArtifactVersion exists; deferrable to avoid chicken-and-egg on insert.
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_currentVersionId_fkey"
  FOREIGN KEY ("currentVersionId") REFERENCES "ArtifactVersion"(id)
  ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS "Artifact_spaceId_taskId_idx" ON "Artifact"("spaceId", "taskId");
CREATE INDEX IF NOT EXISTS "Artifact_spaceId_status_idx" ON "Artifact"("spaceId", "status");
CREATE INDEX IF NOT EXISTS "ArtifactVersion_artifactId_idx" ON "ArtifactVersion"("artifactId");

ALTER TABLE "Artifact"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ArtifactVersion" ENABLE ROW LEVEL SECURITY;
