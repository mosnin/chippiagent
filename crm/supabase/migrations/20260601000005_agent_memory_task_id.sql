-- Add taskId to AgentMemory for task-scoped memory isolation.
-- Allows retrieval of memories specific to a single AgentTask run,
-- enabling the agent to maintain per-task context separate from
-- the persistent cross-run space memory.

ALTER TABLE "AgentMemory"
  ADD COLUMN IF NOT EXISTS "taskId" TEXT REFERENCES "AgentTask"(id) ON DELETE SET NULL;

-- Index for task-scoped memory retrieval
CREATE INDEX IF NOT EXISTS "AgentMemory_taskId_idx"
  ON "AgentMemory"("taskId")
  WHERE "taskId" IS NOT NULL;

-- Composite index for the common query pattern:
-- load_task_memories(spaceId, taskId)
CREATE INDEX IF NOT EXISTS "AgentMemory_spaceId_taskId_idx"
  ON "AgentMemory"("spaceId", "taskId")
  WHERE "taskId" IS NOT NULL;
