-- Phase 1d of the on-demand agent: persist tool calls alongside text.
--
-- The existing Message table stores (role, content) — fine for plain chat,
-- but Phase 2 introduces messages that contain a mix of text segments, tool
-- calls, tool results, and permission prompts. Rather than a second table,
-- we add a nullable `blocks` JSONB column that stores the ordered sequence
-- of rendered blocks for that message.
--
-- Shape (enforced at the type level, not via CHECK — the structure is rich
-- and evolving; we'd rather iterate in TS than churn the constraint):
--
--   [
--     { "type": "text", "content": "..." },
--     { "type": "tool_call", "callId": "...", "name": "...", "args": {...},
--       "result": { "ok": true, "summary": "...", "data": {...} },
--       "status": "complete" | "error" | "denied" | "pending" },
--     ...
--   ]
--
-- When `blocks` is NULL, the row is a legacy plain-text message — the client
-- renders `content` as a single text block and we don't break anything.
-- When populated, the client ignores `content` and renders from `blocks`.

ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "blocks" JSONB;

-- Index on (conversationId, createdAt) is already present for history
-- loads; no additional index needed for blocks specifically — we always
-- read them as part of the message row.
