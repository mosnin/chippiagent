-- ═══════════════════════════════════════════════════════════════════════════
-- ChatUsage — per-turn cost of interactive Chippi chat.
--
-- Why a dedicated table: ExecutionStep tracks AUTONOMOUS agent steps (it's
-- FK'd to AgentTask, which a chat turn doesn't have). Interactive chat
-- turns had no telemetry home at all — the Usage page could only show
-- autonomous-run spend. This table closes that gap.
--
-- One row per completed chat turn, written by BOTH runtimes:
--   - TS runtime  → lib/ai-tools/sdk-chat-stream.ts after result.completed
--   - Modal       → agent/modal_app.py after the run stream drains
--
-- costUsd is precomputed at write time (the writer knows the model +
-- token counts), so the Usage page just SUMs it — no query-time
-- derivation like GoalDecomposition needs.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "ChatUsage" (
  "id"               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"          text NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  -- Clerk userId of the realtor who sent the message. Nullable for
  -- backward-compat with older callers that don't thread it through.
  "userId"           text,
  "conversationId"   text,
  -- Model slug as the runtime knows it (e.g. 'gpt-5-mini', 'x-ai/grok-4.3').
  "model"            text NOT NULL,
  "promptTokens"     integer NOT NULL DEFAULT 0 CHECK ("promptTokens" >= 0),
  "completionTokens" integer NOT NULL DEFAULT 0 CHECK ("completionTokens" >= 0),
  -- Precomputed USD cost. numeric(10,6) matches ExecutionStep.costUsd.
  "costUsd"          numeric(10,6) NOT NULL DEFAULT 0,
  -- 'modal' (production) | 'ts' (fallback runtime). Diagnostic only.
  "runtime"          text NOT NULL DEFAULT 'modal',
  "createdAt"        timestamptz NOT NULL DEFAULT now()
);

-- Hot path: Usage page month / day windows, scoped by space + time.
CREATE INDEX IF NOT EXISTS "ChatUsage_spaceId_createdAt_idx"
  ON "ChatUsage" ("spaceId", "createdAt" DESC);

-- By-model rollup for the Usage page breakdown table.
CREATE INDEX IF NOT EXISTS "ChatUsage_spaceId_model_idx"
  ON "ChatUsage" ("spaceId", "model");

ALTER TABLE "ChatUsage" ENABLE ROW LEVEL SECURITY;

-- Service-role writes (both runtimes use the service key). Space owners
-- can read their own usage for the Settings → Usage page.
CREATE POLICY "chat_usage_owner_read"
  ON "ChatUsage" FOR SELECT
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );
