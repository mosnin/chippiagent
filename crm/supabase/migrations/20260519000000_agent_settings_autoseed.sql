-- AgentSettings auto-seed: every Space gets a row.
--
-- The agent runtime (agent/modal_app.py) looks up an AgentSettings row by
-- spaceId on every chat turn and every heartbeat tick. The original
-- 20260419000000_agent_tables.sql migration created the table but did not
-- seed rows for existing spaces, so any space that pre-dated that migration
-- — or any new space created without going through the API path that inserts
-- a row — caused the runtime to throw PGRST116 ("0 rows") and surface as a
-- silent 500 with no body. This migration closes the gap from both ends:
--
--   1. Backfill — every existing Space without an AgentSettings row gets
--      one with the table-default values (enabled=false, suggest_only,
--      50k token budget, lead_nurture only).
--
--   2. Trigger — every future Space INSERT auto-creates a paired
--      AgentSettings row, so a future operator never has to remember.
--
-- Idempotent: NOT EXISTS guards on the backfill, CREATE OR REPLACE on the
-- trigger function, DROP IF EXISTS on the trigger itself.

-----------------------------------------------------------------------
-- 1. Backfill existing spaces
-----------------------------------------------------------------------
INSERT INTO "AgentSettings" ("spaceId")
SELECT s.id
  FROM "Space" s
 WHERE NOT EXISTS (
   SELECT 1 FROM "AgentSettings" a WHERE a."spaceId" = s.id
 );

-----------------------------------------------------------------------
-- 2. Trigger function — fires AFTER INSERT on Space
-----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ensure_agent_settings_for_space()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO "AgentSettings" ("spaceId")
  VALUES (NEW.id)
  ON CONFLICT ("spaceId") DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS space_autoseed_agent_settings ON "Space";

CREATE TRIGGER space_autoseed_agent_settings
AFTER INSERT ON "Space"
FOR EACH ROW
EXECUTE FUNCTION ensure_agent_settings_for_space();
