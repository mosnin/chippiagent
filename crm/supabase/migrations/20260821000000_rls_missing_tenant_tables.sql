-- ============================================================================
-- Close tenant-data leaks on tables that shipped without RLS, and keep
-- reorder_deal from moving a deal onto another space's stage.
-- ============================================================================
--
-- Supabase PostgREST exposes every public-schema table to the anon key.
-- ENABLE ROW LEVEL SECURITY with no policy = DENY ALL for anon/authenticated.
-- Chippi's API uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS, so
-- existing server routes keep working. Browser realtime never subscribed
-- to these tables.
--
-- Conversation is the worst existing-DB miss: schema.sql enables RLS for
-- fresh installs, but the table-creating migration never did, so production
-- DBs that only ran migrations left chat titles readable via the anon key.
--
-- Idempotent: ENABLE ROW LEVEL SECURITY is a no-op when already on.
-- Tables that may not exist on every env are gated with to_regclass.
-- ============================================================================

DO $$
DECLARE
  tenant_tables text[] := ARRAY[
    'Conversation',
    'Attachment',
    'Pipeline',
    'AgentSettings',
    'AgentGoal',
    'AgentQuestion',
    'AgentTrajectory',
    'TelemetryEvent',
    'Announcement',
    'AnnouncementDismissal',
    'EmailBroadcast',
    'BrokerNotification',
    'ContactActivity'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- Defense-in-depth: reorder_deal must refuse a cross-space stage move even
-- when the caller is service_role (which bypasses RLS). TEXT variables —
-- Space/Deal ids are text UUIDs, not uuid.
CREATE OR REPLACE FUNCTION reorder_deal(
  p_deal_id      text,
  p_new_stage_id text,
  p_new_position integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_deal_space_id text;
  v_stage_space_id text;
BEGIN
  SELECT "spaceId" INTO v_deal_space_id
    FROM "Deal" WHERE id = p_deal_id;
  IF v_deal_space_id IS NULL THEN
    RAISE EXCEPTION 'Deal not found';
  END IF;

  SELECT "spaceId" INTO v_stage_space_id
    FROM "DealStage" WHERE id = p_new_stage_id;
  IF v_stage_space_id IS NULL OR v_stage_space_id IS DISTINCT FROM v_deal_space_id THEN
    RAISE EXCEPTION 'Stage not found or belongs to different space';
  END IF;

  UPDATE "Deal"
  SET position = position + 1
  WHERE "stageId" = p_new_stage_id
    AND "spaceId" = v_deal_space_id
    AND position >= p_new_position
    AND id != p_deal_id;

  UPDATE "Deal"
  SET "stageId"   = p_new_stage_id,
      position    = p_new_position,
      "updatedAt" = now()
  WHERE id = p_deal_id
    AND "spaceId" = v_deal_space_id;
END;
$$;

-- Mutating RPCs must not stay executable by PUBLIC / anon. Service role
-- is the only caller Chippi uses.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cleanup_agent_data'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    REVOKE ALL ON FUNCTION cleanup_agent_data() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION cleanup_agent_data() TO service_role;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'offboard_brokerage_member'
      AND pg_get_function_identity_arguments(p.oid) = 'text, text, text, boolean'
  ) THEN
    REVOKE ALL ON FUNCTION offboard_brokerage_member(text, text, text, boolean) FROM PUBLIC;
    REVOKE ALL ON FUNCTION offboard_brokerage_member(text, text, text, boolean) FROM authenticated;
    GRANT EXECUTE ON FUNCTION offboard_brokerage_member(text, text, text, boolean) TO service_role;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'reorder_deal'
      AND pg_get_function_identity_arguments(p.oid) = 'text, text, integer'
  ) THEN
    REVOKE ALL ON FUNCTION reorder_deal(text, text, integer) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION reorder_deal(text, text, integer) TO service_role;
  END IF;
END $$;
