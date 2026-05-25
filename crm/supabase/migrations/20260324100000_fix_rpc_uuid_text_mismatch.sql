-- Fix: RPC function parameters declared as UUID but table columns are TEXT.
-- This mismatch causes implicit cast failures in certain PostgreSQL
-- configurations, leading to misleading "slug already taken" errors
-- when the real error is a type mismatch.

-----------------------------------------------------------------------
-- 1. book_tour_atomic — change UUID params to TEXT
-----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION book_tour_atomic(
  p_id            TEXT,
  p_space_id      TEXT,
  p_contact_id    TEXT,
  p_guest_name    TEXT,
  p_guest_email   TEXT,
  p_guest_phone   TEXT,
  p_property_address TEXT,
  p_notes         TEXT,
  p_starts_at     TIMESTAMPTZ,
  p_ends_at       TIMESTAMPTZ,
  p_property_profile_id TEXT,
  p_manage_token  TEXT
) RETURNS TEXT AS $$
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
-- 2. create_space_with_defaults — change UUID params to TEXT
-----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_space_with_defaults(
  p_space_id       TEXT,
  p_slug           TEXT,
  p_name           TEXT,
  p_emoji          TEXT,
  p_owner_id       TEXT,
  p_settings_id    TEXT,
  p_intake_title   TEXT,
  p_intake_intro   TEXT,
  p_business_name  TEXT,
  p_stages         JSONB
) RETURNS TEXT AS $$
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
        v_stage->>'id',
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
-- 3. create_brokerage_with_owner — change UUID params to TEXT
-----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_brokerage_with_owner(
  p_name     TEXT,
  p_owner_id TEXT
) RETURNS TEXT AS $$
DECLARE
  v_brokerage_id TEXT;
BEGIN
  INSERT INTO "Brokerage" (name, "ownerId")
    VALUES (p_name, p_owner_id)
    RETURNING id INTO v_brokerage_id;

  INSERT INTO "BrokerageMembership" ("brokerageId", "userId", role)
    VALUES (v_brokerage_id, p_owner_id, 'broker_owner');

  RETURN v_brokerage_id;
END;
$$ LANGUAGE plpgsql;
