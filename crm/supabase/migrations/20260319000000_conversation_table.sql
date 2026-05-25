-- Create Conversation table for AI chat history
CREATE TABLE IF NOT EXISTS "Conversation" (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"   text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT 'New conversation',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_space_updated
  ON "Conversation" ("spaceId", "updatedAt" DESC);

-- Add conversationId column to Message table
ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "conversationId" text REFERENCES "Conversation"(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_message_conversation_created
  ON "Message" ("conversationId", "createdAt" ASC);
