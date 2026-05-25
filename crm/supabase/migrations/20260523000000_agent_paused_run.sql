-- Paused chat runs from the SDK-based runtime (`@openai/agents`).
--
-- The custom loop in `lib/ai-tools/loop.ts` paused conversations through the
-- existing `AgentDraft`/`AgentQuestion` tables — but those carry SMS/email/note
-- *drafts*, which are a different concept. A paused chat run is a transient
-- checkpoint: the realtor asked Chippi to do something, a tool needs approval,
-- the run is suspended until they decide. Drafts are "Chippi composed
-- something while you weren't looking." Different lifecycle, different shape.
--
-- The runState column carries the SDK's `RunState.toString()` output. It's
-- opaque from our side; we round-trip it via `RunState.fromString(agent, str)`
-- when the realtor decides. Schema-versioned by the SDK itself
-- (`CURRENT_SCHEMA_VERSION` lives inside the string), so an SDK upgrade
-- that breaks the format will fail loudly on resume rather than silently.
--
-- The approvals JSONB is the realtor-facing prompt list — `ApprovalPrompt[]`
-- as defined in `lib/ai-tools/sdk-bridge.ts`. We store it alongside the
-- runState so the UI can render the pending decisions without rehydrating
-- the run.

CREATE TABLE IF NOT EXISTS "AgentPausedRun" (
  "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"        TEXT NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  -- Clerk userId of the realtor whose chat is paused. Not a Space-scoped
  -- foreign key because we don't store user rows; auth resolves via Clerk.
  "userId"         TEXT NOT NULL,
  -- Optional: the chat conversation/thread the run belongs to. Null for
  -- one-shot agent invocations not bound to a persisted thread.
  "conversationId" TEXT,
  -- The full SDK RunState. Text, not JSONB — it's opaque to Postgres and
  -- the SDK serialises with its own schema versioning.
  "runState"       TEXT NOT NULL,
  -- Pending approvals as ApprovalPrompt[] (see lib/ai-tools/sdk-bridge.ts).
  "approvals"      JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status"         TEXT NOT NULL DEFAULT 'pending'
                     CHECK ("status" IN ('pending', 'resumed', 'cancelled', 'expired')),
  "expiresAt"      TIMESTAMPTZ,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Most-common query: "what's pending in this space?" — the chat UI polls
-- this on mount. Sorted by created so newest pauses surface first.
CREATE INDEX IF NOT EXISTS "AgentPausedRun_spaceId_status_idx"
  ON "AgentPausedRun" ("spaceId", "status", "createdAt" DESC);

-- Per-user filter for sessions where multiple realtors share a Space.
CREATE INDEX IF NOT EXISTS "AgentPausedRun_userId_idx"
  ON "AgentPausedRun" ("userId");

ALTER TABLE "AgentPausedRun" ENABLE ROW LEVEL SECURITY;
