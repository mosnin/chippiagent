-- Temporary authorization codes for OAuth PKCE flow
CREATE TABLE IF NOT EXISTS "McpAuthCode" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "code" text UNIQUE NOT NULL,
  "clientId" text NOT NULL,
  "spaceId" text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "codeChallenge" text NOT NULL,
  "codeChallengeMethod" text NOT NULL DEFAULT 'S256',
  "redirectUri" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_auth_code ON "McpAuthCode" ("code");
ALTER TABLE "McpAuthCode" ENABLE ROW LEVEL SECURITY;
