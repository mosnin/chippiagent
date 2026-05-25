-- Migration: Atomic database functions for race-condition-prone operations
-- Fixes: tour double-booking, non-atomic space creation, non-atomic brokerage creation

-----------------------------------------------------------------------
-- 1. Atomic tour booking — prevents double-booking via row-level lock
-----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION book_tour_atomic(
  p_id            UUID,
  p_space_id      UUID,
  p_contact_id    UUID,
  p_guest_name    TEXT,
  p_guest_email   TEXT,
  p_guest_phone   TEXT,
  p_property_address TEXT,
  p_notes         TEXT,
  p_starts_at     TIMESTAMPTZ,
  p_ends_at       TIMESTAMPTZ,
  p_property_profile_id UUID,
  p_manage_token  TEXT
) RETURNS UUID AS $$
DECLARE
  v_conflict_count INT;
BEGIN
  -- Lock existing overlapping tours to prevent concurrent inserts
  PERFORM id FROM "Tour"
    WHERE "spaceId" = p_space_id
      AND status IN ('scheduled', 'confirmed')
      AND "startsAt" < p_ends_at
      AND "endsAt" > p_starts_at
    FOR UPDATE;

  -- Count conflicts (after acquiring lock)
  SELECT COUNT(*) INTO v_conflict_count
    FROM "Tour"
    WHERE "spaceId" = p_space_id
      AND status IN ('scheduled', 'confirmed')
      AND "startsAt" < p_ends_at
      AND "endsAt" > p_starts_at;

  IF v_conflict_count > 0 THEN
    RETURN NULL;  -- Conflict found; caller should return 409
  END IF;

  INSERT INTO "Tour" (
    id, "spaceId", "contactId", "guestName", "guestEmail", "guestPhone",
    "propertyAddress", notes, "startsAt", "endsAt", "propertyProfileId", "manageToken"
  ) VALUES (
    p_id, p_space_id, p_contact_id, p_guest_name, p_guest_email, p_guest_phone,
    p_property_address, p_notes, p_starts_at, p_ends_at, p_property_profile_id, p_manage_token
  );

  RETURN p_id;
END;
$$ LANGUAGE plpgsql;

-----------------------------------------------------------------------
-- 2. Atomic space + settings + default stages creation
-----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_space_with_defaults(
  p_space_id       UUID,
  p_slug           TEXT,
  p_name           TEXT,
  p_emoji          TEXT,
  p_owner_id       UUID,
  p_settings_id    UUID,
  p_intake_title   TEXT,
  p_intake_intro   TEXT,
  p_business_name  TEXT,
  p_stages         JSONB  -- array of {id, name, color, position}
) RETURNS UUID AS $$
DECLARE
  v_stage JSONB;
BEGIN
  -- Insert space
  INSERT INTO "Space" (id, slug, name, emoji, "ownerId")
    VALUES (p_space_id, p_slug, p_name, p_emoji, p_owner_id);

  -- Insert settings
  INSERT INTO "SpaceSetting" (id, "spaceId", "intakePageTitle", "intakePageIntro", "businessName", "phoneNumber")
    VALUES (p_settings_id, p_space_id, p_intake_title, p_intake_intro, p_business_name, NULL);

  -- Insert default stages
  FOR v_stage IN SELECT * FROM jsonb_array_elements(p_stages)
  LOOP
    INSERT INTO "DealStage" (id, "spaceId", name, color, position)
      VALUES (
        (v_stage->>'id')::UUID,
        p_space_id,
        v_stage->>'name',
        v_stage->>'color',
        (v_stage->>'position')::INT
      );
  END LOOP;

  RETURN p_space_id;
END;
$$ LANGUAGE plpgsql;

-----------------------------------------------------------------------
-- 3. Atomic brokerage + owner membership creation
-----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_brokerage_with_owner(
  p_name     TEXT,
  p_owner_id UUID
) RETURNS UUID AS $$
DECLARE
  v_brokerage_id UUID;
BEGIN
  INSERT INTO "Brokerage" (name, "ownerId")
    VALUES (p_name, p_owner_id)
    RETURNING id INTO v_brokerage_id;

  INSERT INTO "BrokerageMembership" ("brokerageId", "userId", role)
    VALUES (v_brokerage_id, p_owner_id, 'broker_owner');

  RETURN v_brokerage_id;
END;
$$ LANGUAGE plpgsql;

-----------------------------------------------------------------------
-- 4. Harden reorder_deal — verify deal and stage share the same space
-----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reorder_deal(
  p_deal_id      text,
  p_new_stage_id text,
  p_new_position integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_deal_space_id UUID;
  v_stage_space_id UUID;
BEGIN
  -- Verify deal exists and get its spaceId
  SELECT "spaceId" INTO v_deal_space_id
    FROM "Deal" WHERE id = p_deal_id;
  IF v_deal_space_id IS NULL THEN
    RAISE EXCEPTION 'Deal not found';
  END IF;

  -- Verify stage exists and belongs to the same space
  SELECT "spaceId" INTO v_stage_space_id
    FROM "DealStage" WHERE id = p_new_stage_id;
  IF v_stage_space_id IS NULL OR v_stage_space_id != v_deal_space_id THEN
    RAISE EXCEPTION 'Stage not found or belongs to different space';
  END IF;

  -- Shift deals at or after the target position up by one to make room
  UPDATE "Deal"
  SET position = position + 1
  WHERE "stageId" = p_new_stage_id
    AND position >= p_new_position
    AND id != p_deal_id;

  -- Place the deal at its new stage and position
  UPDATE "Deal"
  SET "stageId"   = p_new_stage_id,
      position    = p_new_position,
      "updatedAt" = now()
  WHERE id = p_deal_id;
END;
$$;
