-- Update McpApiKey to support OAuth client credentials
ALTER TABLE "McpApiKey"
  ADD COLUMN IF NOT EXISTS "clientId" text UNIQUE,
  ADD COLUMN IF NOT EXISTS "clientSecretHash" text;

CREATE INDEX IF NOT EXISTS idx_mcp_api_key_client_id ON "McpApiKey" ("clientId");
