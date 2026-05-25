-- Add state nonce columns to McpAuthCode for OAuth state verification
ALTER TABLE "McpAuthCode" ADD COLUMN IF NOT EXISTS "stateNonce" text;
ALTER TABLE "McpAuthCode" ADD COLUMN IF NOT EXISTS "stateHash" text;

-- Add 'banned' as a valid platformRole for secondary ban check in middleware
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_platformRole_check";
ALTER TABLE "User" ADD CONSTRAINT "User_platformRole_check"
  CHECK ("platformRole" IN ('user', 'admin', 'banned'));
