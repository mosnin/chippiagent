-- MCP API keys for per-user access to the MCP server
CREATE TABLE IF NOT EXISTS "McpApiKey" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId" text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "name" text NOT NULL DEFAULT 'Default',
  "keyHash" text NOT NULL,
  "keyPrefix" text NOT NULL,
  "lastUsedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_api_key_space ON "McpApiKey" ("spaceId");
CREATE INDEX IF NOT EXISTS idx_mcp_api_key_hash ON "McpApiKey" ("keyHash");
ALTER TABLE "McpApiKey" ENABLE ROW LEVEL SECURITY;
