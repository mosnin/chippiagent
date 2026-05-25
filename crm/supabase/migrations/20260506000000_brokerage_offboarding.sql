-- ============================================================================
-- Brokerage Offboarding: atomic member transfer
-- ============================================================================
-- When a brokerage offboards a member (realtor leaves the firm, manager is
-- removed, etc.), the brokerage-scoped records owned by that member — the
-- contacts the brokerage considers its own, plus the deals / activities /
-- checklist items / tours that hang off those contacts — must be re-homed to
-- another member's Space in a single atomic step.
--
-- This migration:
--   1. Extends "User" with offboarding state columns (status, offboardedAt,
--      offboardedToUserId) so the API and UI can reason about who is active
--      and where their work was transferred.
--   2. Defines `offboard_brokerage_member(...)`, a SECURITY DEFINER function
--      that performs (or previews, via dry-run) the re-parenting of every
--      brokerage-scoped row in a single transaction. If any statement fails,
--      the whole transfer rolls back — no half-migrated state where some
--      contacts moved but their deals did not.
--
-- The function is called by the API route via `supabase.rpc(...)`. The route
-- is responsible for authorization (only broker_owner / broker_manager may
-- invoke); this function assumes the caller has already been authorized.
-- ============================================================================

-----------------------------------------------------------------------
-- 1. Extend "User" with offboarding state
-----------------------------------------------------------------------
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'offboarded'));

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "offboardedAt" timestamptz;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "offboardedToUserId" text
    REFERENCES "User"(id) ON DELETE SET NULL;


-----------------------------------------------------------------------
-- 2. offboard_brokerage_member — atomic transfer + state update
-----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION offboard_brokerage_member(
  p_leaving_user_id     text,
  p_destination_user_id text,
  p_brokerage_id        text,
  p_dry_run             boolean DEFAULT false
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leaving_space_id     text;
  v_destination_space_id text;
  v_contact_count        integer := 0;
  v_deal_count           integer := 0;
  v_tour_count           integer := 0;
  v_open_tour_count      integer := 0;
BEGIN
  ---------------------------------------------------------------------
  -- Resolve and lock both spaces up front so counts match writes.
  -- Space ownership is 1:1 with User via Space.ownerId.
  ---------------------------------------------------------------------
  SELECT id INTO v_leaving_space_id
    FROM "Space"
    WHERE "ownerId" = p_leaving_user_id
    FOR UPDATE;

  IF v_leaving_space_id IS NULL THEN
    RAISE EXCEPTION 'Leaving user % has no Space row; cannot offboard', p_leaving_user_id;
  END IF;

  SELECT id INTO v_destination_space_id
    FROM "Space"
    WHERE "ownerId" = p_destination_user_id
    FOR UPDATE;

  IF v_destination_space_id IS NULL THEN
    RAISE EXCEPTION 'Destination user % has no Space row; cannot receive transfer', p_destination_user_id;
  END IF;

  IF v_leaving_space_id = v_destination_space_id THEN
    RAISE EXCEPTION 'Leaving and destination users resolve to the same Space (%); nothing to transfer', v_leaving_space_id;
  END IF;

  ---------------------------------------------------------------------
  -- DRY RUN: count-only, no writes, no state change.
  ---------------------------------------------------------------------
  IF p_dry_run THEN
    SELECT COUNT(*) INTO v_contact_count
      FROM "Contact"
      WHERE "spaceId" = v_leaving_space_id
        AND "brokerageId" = p_brokerage_id;

    SELECT COUNT(DISTINCT d.id) INTO v_deal_count
      FROM "Deal" d
      WHERE d."spaceId" = v_leaving_space_id
        AND d.id IN (
          SELECT dc."dealId"
            FROM "DealContact" dc
            JOIN "Contact" c ON c.id = dc."contactId"
            WHERE c."spaceId" = v_leaving_space_id
              AND c."brokerageId" = p_brokerage_id
        );

    SELECT COUNT(*) INTO v_open_tour_count
      FROM "Tour" t
      JOIN "Contact" c ON c.id = t."contactId"
      WHERE t."spaceId" = v_leaving_space_id
        AND c."spaceId" = v_leaving_space_id
        AND c."brokerageId" = p_brokerage_id
        AND t."startsAt" >= now();

    RETURN json_build_object(
      'dryRun', true,
      'contactCount', v_contact_count,
      'dealCount', v_deal_count,
      'openTourCount', v_open_tour_count
    );
  END IF;

  ---------------------------------------------------------------------
  -- REAL RUN: perform all moves inside this function's transaction.
  -- Any RAISE / error rolls back the entire set.
  ---------------------------------------------------------------------

  -- (a) Move brokerage-scoped contacts; capture their ids.
  CREATE TEMP TABLE _moved_contacts ON COMMIT DROP AS
  WITH moved AS (
    UPDATE "Contact"
       SET "spaceId" = v_destination_space_id
     WHERE "spaceId" = v_leaving_space_id
       AND "brokerageId" = p_brokerage_id
     RETURNING id
  )
  SELECT id FROM moved;

  GET DIAGNOSTICS v_contact_count = ROW_COUNT;

  -- (b) Move ContactActivity rows for those contacts.
  UPDATE "ContactActivity"
     SET "spaceId" = v_destination_space_id
   WHERE "contactId" IN (SELECT id FROM _moved_contacts);

  -- (c) Move Deals that are in the leaving space AND linked to a moved contact.
  CREATE TEMP TABLE _moved_deals ON COMMIT DROP AS
  WITH moved AS (
    UPDATE "Deal"
       SET "spaceId" = v_destination_space_id
     WHERE "spaceId" = v_leaving_space_id
       AND id IN (
         SELECT DISTINCT "dealId"
           FROM "DealContact"
           WHERE "contactId" IN (SELECT id FROM _moved_contacts)
       )
     RETURNING id
  )
  SELECT id FROM moved;

  GET DIAGNOSTICS v_deal_count = ROW_COUNT;

  -- (d) Move DealActivity for moved deals.
  UPDATE "DealActivity"
     SET "spaceId" = v_destination_space_id
   WHERE "dealId" IN (SELECT id FROM _moved_deals);

  -- (e) Move DealChecklistItem for moved deals.
  UPDATE "DealChecklistItem"
     SET "spaceId" = v_destination_space_id
   WHERE "dealId" IN (SELECT id FROM _moved_deals);

  -- (f) Move Tours that are in the leaving space AND for a moved contact.
  WITH moved AS (
    UPDATE "Tour"
       SET "spaceId" = v_destination_space_id
     WHERE "spaceId" = v_leaving_space_id
       AND "contactId" IN (SELECT id FROM _moved_contacts)
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_tour_count FROM moved;

  -- (g) Flip the leaving user's offboarding state.
  UPDATE "User"
     SET status               = 'offboarded',
         "offboardedAt"       = now(),
         "offboardedToUserId" = p_destination_user_id
   WHERE id = p_leaving_user_id;

  -- (h) Remove the brokerage membership row — access-block agent also keys
  --     off User.status, but dropping the membership makes the severance
  --     explicit and causes any brokerage-scoped queries to fail closed.
  DELETE FROM "BrokerageMembership"
   WHERE "userId" = p_leaving_user_id
     AND "brokerageId" = p_brokerage_id;

  RETURN json_build_object(
    'dryRun', false,
    'contactsMoved', v_contact_count,
    'dealsMoved', v_deal_count,
    'toursMoved', v_tour_count
  );
END;
$$;

-- Allow authenticated users and the service role to invoke.
-- The API route performs authorization before calling.
GRANT EXECUTE ON FUNCTION offboard_brokerage_member(text, text, text, boolean)
  TO authenticated, service_role;
