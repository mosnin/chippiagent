CREATE TABLE IF NOT EXISTS "DeadLetterEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId" text NOT NULL,
  "eventType" text NOT NULL,
  "eventPayload" jsonb NOT NULL DEFAULT '{}',
  "errorMessage" text NOT NULL,
  "errorStack" text,
  "attemptCount" int NOT NULL DEFAULT 1,
  "firstFailedAt" timestamptz NOT NULL DEFAULT now(),
  "lastFailedAt" timestamptz NOT NULL DEFAULT now(),
  "resolvedAt" timestamptz,
  "resolvedBy" text,
  "resolutionNote" text,
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','retrying','resolved','abandoned')),
  "taskId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "DisabledSpace" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId" text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "reason" text NOT NULL,
  "disabledBy" text NOT NULL DEFAULT 'system',
  "disabledAt" timestamptz NOT NULL DEFAULT now(),
  "reenabledAt" timestamptz,
  "isActive" boolean NOT NULL DEFAULT true
);

-- Only one active disable record per space
CREATE UNIQUE INDEX IF NOT EXISTS "DisabledSpace_spaceId_active_idx"
  ON "DisabledSpace"("spaceId") WHERE "isActive" = true;

CREATE INDEX IF NOT EXISTS "DeadLetterEvent_spaceId_status_idx" ON "DeadLetterEvent"("spaceId", "status");
CREATE INDEX IF NOT EXISTS "DeadLetterEvent_eventType_idx" ON "DeadLetterEvent"("eventType");
CREATE INDEX IF NOT EXISTS "DisabledSpace_spaceId_isActive_idx" ON "DisabledSpace"("spaceId", "isActive");

ALTER TABLE "DeadLetterEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DisabledSpace" ENABLE ROW LEVEL SECURITY;
