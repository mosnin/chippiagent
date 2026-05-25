-- ============================================================================
-- Step 3 audit follow-up: RLS + FK semantics for DealRoutingRule
-- ============================================================================
-- Two findings from the lead-routing audit:
--
--   1. DealRoutingRule was never RLS-enabled, so an attacker with direct
--      PostgREST access (via the anon key + Clerk JWT) could in principle
--      read rules from every brokerage. The app already uses the service
--      role key everywhere, but defence-in-depth says enable RLS with no
--      policies (same pattern the rest of the brokerage tables use — only
--      service-role access gets through, anon/authenticated get nothing).
--
--   2. The FK `destinationUserId REFERENCES "User"(id) ON DELETE SET NULL`
--      combined with the XOR CHECK (exactly one of destinationUserId /
--      destinationPoolMethod) creates an inconsistent state when a User
--      referenced by a rule is hard-deleted: destinationUserId gets nulled
--      out, the other destination field is still NULL, the CHECK fires,
--      and the whole User DELETE rolls back. Net effect: you can't delete
--      a user who's referenced as a routing target until the broker
--      manually reassigns every rule.
--
-- Flipping to ON DELETE CASCADE means the rule dies with the user. A rule
-- whose target is gone has no business continuing to match leads — the
-- broker can recreate it when they know who the replacement should be.
-- Hard User deletes are rare (offboarding doesn't delete the row), so this
-- is a low-frequency operation with a correct semantic outcome.
-- ============================================================================

-- 1. RLS — no policies. Service-role bypasses; anon/authenticated denied.
ALTER TABLE "DealRoutingRule" ENABLE ROW LEVEL SECURITY;

-- 2. Replace the destinationUserId FK to CASCADE on user delete.
-- Drop the constraint by looking up its name (Postgres auto-names FKs)
-- and recreating it with the desired action. IF EXISTS makes the drop
-- safe to replay; the recreate has a stable name so the next replay is a
-- no-op (CREATE ... IF NOT EXISTS isn't supported on constraints, so we
-- guard the rename via a DO block).

DO $$
DECLARE
  v_con_name text;
BEGIN
  -- Find the current FK on destinationUserId (Postgres named it after the
  -- column at CREATE TABLE time; don't hard-code the auto-generated name).
  SELECT con.conname
    INTO v_con_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'DealRoutingRule'
     AND con.contype = 'f'
     AND con.confrelid = (SELECT oid FROM pg_class WHERE relname = 'User')
     AND array_length(con.conkey, 1) = 1
     AND (SELECT attname FROM pg_attribute
           WHERE attrelid = con.conrelid AND attnum = con.conkey[1])
          = 'destinationUserId';
  IF v_con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "DealRoutingRule" DROP CONSTRAINT %I', v_con_name);
  END IF;
END
$$;

ALTER TABLE "DealRoutingRule"
  ADD CONSTRAINT "DealRoutingRule_destinationUserId_fkey"
  FOREIGN KEY ("destinationUserId") REFERENCES "User"(id) ON DELETE CASCADE;
