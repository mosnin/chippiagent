-- Source attribution for AgentMemory rows.
-- Enables tracing: "where did this belief come from?"

ALTER TABLE "AgentMemory"
  ADD COLUMN IF NOT EXISTS "sourceRunId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceToolName" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceConversationId" TEXT;

-- Index for finding all memories created in a specific run
CREATE INDEX IF NOT EXISTS "AgentMemory_sourceRunId_idx"
  ON "AgentMemory"("sourceRunId")
  WHERE "sourceRunId" IS NOT NULL;

-- Index for finding all memories from a specific tool
CREATE INDEX IF NOT EXISTS "AgentMemory_sourceToolName_idx"
  ON "AgentMemory"("sourceToolName")
  WHERE "sourceToolName" IS NOT NULL;

COMMENT ON COLUMN "AgentMemory"."sourceRunId" IS 'The orchestrator run ID that created this memory';
COMMENT ON COLUMN "AgentMemory"."sourceToolName" IS 'The tool name (e.g. find_contacts) that triggered this memory write';
COMMENT ON COLUMN "AgentMemory"."sourceConversationId" IS 'The chat conversation ID if memory was created during a chat turn';
