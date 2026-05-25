-- Drop dead AgentSettings columns.
--
-- After collapsing the multi-agent platform into a single Chippi agent
-- and deleting the 15-minute heartbeat:
--
--   autonomyLevel             — three-mode autonomy (autonomous / draft_required
--                               / suggest_only). Replaced by always-draft.
--   perAgentAutonomy          — per-specialist autonomy override JSON.
--                               Specialists are gone.
--   confidenceThreshold       — knob that downgraded autonomous→draft below a
--                               numeric confidence. Always-draft moots it.
--   enabledAgents             — list of which specialists were active.
--                               Specialists are gone.
--   heartbeatIntervalMinutes  — interval for the scheduled heartbeat. The
--                               heartbeat is gone; runs are trigger-only.
--
-- The agent runtime stopped reading these fields in the unified-agent
-- refactor (extra="ignore" on the Pydantic model). The Next API route
-- (app/api/agent/settings) and Settings UI panel
-- (components/agent/agent-settings-panel.tsx) stopped writing them in
-- the same PR. This migration removes the columns themselves.
--
-- Idempotent: IF EXISTS guards. Safe to re-run.

ALTER TABLE "AgentSettings" DROP COLUMN IF EXISTS "autonomyLevel";
ALTER TABLE "AgentSettings" DROP COLUMN IF EXISTS "perAgentAutonomy";
ALTER TABLE "AgentSettings" DROP COLUMN IF EXISTS "confidenceThreshold";
ALTER TABLE "AgentSettings" DROP COLUMN IF EXISTS "enabledAgents";
ALTER TABLE "AgentSettings" DROP COLUMN IF EXISTS "heartbeatIntervalMinutes";
