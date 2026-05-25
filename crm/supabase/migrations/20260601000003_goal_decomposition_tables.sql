-- GoalDecomposition: records LLM-based goal-to-steps decomposition for agent tasks
-- TaskDependency: captures ordering and data dependencies between AgentTask rows

CREATE TABLE IF NOT EXISTS "GoalDecomposition" (
  "id"               text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"          text        NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "taskId"           text        REFERENCES "AgentTask"(id) ON DELETE CASCADE,
  "goalText"         text        NOT NULL,
  "decomposedSteps"  jsonb       NOT NULL DEFAULT '[]',
  "llmModel"         text        NOT NULL DEFAULT 'gpt-4.1-mini',
  "promptTokens"     int         NOT NULL DEFAULT 0,
  "completionTokens" int         NOT NULL DEFAULT 0,
  "createdAt"        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TaskDependency" (
  "id"               text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "taskId"           text        NOT NULL REFERENCES "AgentTask"(id) ON DELETE CASCADE,
  "dependsOnTaskId"  text        NOT NULL REFERENCES "AgentTask"(id) ON DELETE CASCADE,
  "dependencyType"   text        NOT NULL DEFAULT 'sequential'
                                 CHECK ("dependencyType" IN ('sequential', 'data', 'soft')),
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("taskId", "dependsOnTaskId"),
  CHECK ("taskId" <> "dependsOnTaskId")
);

CREATE INDEX IF NOT EXISTS "GoalDecomposition_spaceId_taskId_idx"  ON "GoalDecomposition"("spaceId", "taskId");
CREATE INDEX IF NOT EXISTS "TaskDependency_taskId_idx"             ON "TaskDependency"("taskId");
CREATE INDEX IF NOT EXISTS "TaskDependency_dependsOnTaskId_idx"    ON "TaskDependency"("dependsOnTaskId");

ALTER TABLE "GoalDecomposition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskDependency"    ENABLE ROW LEVEL SECURITY;
