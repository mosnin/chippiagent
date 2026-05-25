-- Per-realtor integrations to third-party apps via Composio.
--
-- Each row represents one connected account (e.g., the realtor's Gmail
-- linked to their Chippi space). Composio holds the OAuth tokens — we
-- store the pointer (composioConnectionId) so we can fetch the live
-- token and refresh on demand.
--
-- One realtor + one toolkit = at most one ACTIVE row. A realtor can
-- disconnect and reconnect; the prior row goes to status 'revoked'.
--
-- Why a separate table from AgentDraft / AgentPausedRun: integrations
-- are configuration of the realtor's environment, not a transient
-- artifact of a chat turn. Different lifecycle, different shape.

CREATE TABLE IF NOT EXISTS "IntegrationConnection" (
  "id"                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"              TEXT NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "userId"               TEXT NOT NULL,                    -- Clerk userId
  "toolkit"              TEXT NOT NULL,                    -- composio toolkit slug, e.g. 'gmail'
  "composioConnectionId" TEXT NOT NULL,                    -- the connected-account id Composio returns
  "status"               TEXT NOT NULL DEFAULT 'active'
                           CHECK ("status" IN ('active', 'expired', 'revoked', 'failed')),
  "label"                TEXT,                             -- human-readable: 'work@example.com'
  "lastError"            TEXT,                             -- on 'failed' / 'expired'
  "lastUsedAt"           TIMESTAMPTZ,
  "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active connection per (space, userId, toolkit). Disconnect flips
-- the prior row's status to 'revoked' so this constraint stays clean.
CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationConnection_active_unique"
  ON "IntegrationConnection" ("spaceId", "userId", "toolkit")
  WHERE "status" = 'active';

CREATE INDEX IF NOT EXISTS "IntegrationConnection_spaceId_idx"
  ON "IntegrationConnection" ("spaceId", "status");

CREATE INDEX IF NOT EXISTS "IntegrationConnection_userId_idx"
  ON "IntegrationConnection" ("userId");

ALTER TABLE "IntegrationConnection" ENABLE ROW LEVEL SECURITY;
