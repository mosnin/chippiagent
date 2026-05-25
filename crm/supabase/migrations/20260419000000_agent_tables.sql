-- Agent system tables: AgentSettings, AgentActivityLog, AgentDraft, AgentMemory

-- Enable pgvector if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Per-space agent configuration
CREATE TABLE "AgentSettings" (
  id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"               TEXT NOT NULL UNIQUE REFERENCES "Space"(id) ON DELETE CASCADE,
  enabled                 BOOLEAN NOT NULL DEFAULT false,
  "autonomyLevel"         TEXT NOT NULL DEFAULT 'suggest_only'
                            CHECK ("autonomyLevel" IN ('autonomous','draft_required','suggest_only')),
  "dailyTokenBudget"      INT NOT NULL DEFAULT 50000,
  "heartbeatIntervalMinutes" INT NOT NULL DEFAULT 15,
  "enabledAgents"         TEXT[] NOT NULL DEFAULT ARRAY['lead_nurture']::TEXT[],
  "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every action the agent takes (or attempts), append-only audit trail
CREATE TABLE "AgentActivityLog" (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"           TEXT NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "runId"             TEXT NOT NULL,
  "agentType"         TEXT NOT NULL,
  "actionType"        TEXT NOT NULL,
  reasoning           TEXT,
  outcome             TEXT NOT NULL
                        CHECK (outcome IN ('completed','queued_for_approval','suggested','failed')),
  "relatedContactId"  TEXT REFERENCES "Contact"(id) ON DELETE SET NULL,
  "relatedDealId"     TEXT REFERENCES "Deal"(id) ON DELETE SET NULL,
  reversible          BOOLEAN NOT NULL DEFAULT true,
  "reversedAt"        TIMESTAMPTZ,
  metadata            JSONB,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "AgentActivityLog_spaceId_createdAt_idx"
  ON "AgentActivityLog" ("spaceId", "createdAt" DESC);

CREATE INDEX "AgentActivityLog_runId_idx"
  ON "AgentActivityLog" ("runId");

-- Draft messages the agent wants to send, requiring human approval
CREATE TABLE "AgentDraft" (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"     TEXT NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "contactId"   TEXT REFERENCES "Contact"(id) ON DELETE CASCADE,
  "dealId"      TEXT REFERENCES "Deal"(id) ON DELETE SET NULL,
  channel       TEXT NOT NULL CHECK (channel IN ('sms','email','note')),
  subject       TEXT,
  content       TEXT NOT NULL,
  reasoning     TEXT,
  priority      INT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','dismissed','sent')),
  "expiresAt"   TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "AgentDraft_spaceId_status_idx"
  ON "AgentDraft" ("spaceId", status, "createdAt" DESC);

-- Long-term memory facts the agent accumulates across runs
CREATE TABLE "AgentMemory" (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"     TEXT NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "entityType"  TEXT CHECK ("entityType" IN ('contact','deal','space')),
  "entityId"    TEXT,
  "memoryType"  TEXT NOT NULL
                  CHECK ("memoryType" IN ('fact','preference','observation','reminder')),
  content       TEXT NOT NULL,
  embedding     vector(1536),
  importance    FLOAT NOT NULL DEFAULT 0.5,
  "expiresAt"   TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "AgentMemory_spaceId_entityId_idx"
  ON "AgentMemory" ("spaceId", "entityId");

-- HNSW index for fast vector similarity search within a space
CREATE INDEX "AgentMemory_embedding_idx"
  ON "AgentMemory" USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
