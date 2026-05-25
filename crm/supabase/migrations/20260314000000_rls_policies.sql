-- ============================================================================
-- Row-Level Security (RLS) — Defense-in-depth tenant isolation
-- ============================================================================
--
-- The application uses SUPABASE_SERVICE_ROLE_KEY (service role bypasses RLS),
-- so these policies do NOT affect normal app behavior. They exist to:
--
--   1. Protect data if the anon/authenticated role is ever used directly
--      (e.g. Supabase dashboard, direct PostgREST calls with JWT)
--   2. Prevent data leakage if a future code path accidentally uses the
--      public/anon client instead of the service-role client
--   3. Satisfy SOC 2 defense-in-depth and principle of least privilege
--
-- The identity function used here is `auth.uid()` which Supabase populates
-- from the JWT sub claim.  Because we use Clerk JWTs (not Supabase JWTs),
-- you must configure a Supabase JWT hook or pass `x-clerk-user-id` via RLS
-- helper when switching to anon/authenticated roles in the future.
--
-- NOTE: To activate this without breaking the current app, no changes to
-- application code are required — service role always bypasses RLS.
-- ============================================================================

-- ── Enable RLS on all tenant tables ─────────────────────────────────────────

ALTER TABLE "User"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Space"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaceSetting"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contact"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Deal"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealStage"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealContact"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentEmbedding"   ENABLE ROW LEVEL SECURITY;

-- ── Helper: resolve authenticated Clerk user's internal User.id ─────────────
-- This function is used by policies below.
-- It joins auth.uid() (Clerk sub) to the User.clerkId column.
CREATE OR REPLACE FUNCTION current_user_internal_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id FROM "User" WHERE "clerkId" = auth.uid()::text LIMIT 1
$$;

-- ── User table ───────────────────────────────────────────────────────────────
-- Users may only read and update their own row.

CREATE POLICY "user: own row only"
  ON "User"
  FOR ALL
  USING ("clerkId" = auth.uid()::text);

-- ── Space table ──────────────────────────────────────────────────────────────
-- Only the owner can access their space.

CREATE POLICY "space: owner only"
  ON "Space"
  FOR ALL
  USING ("ownerId" = current_user_internal_id());

-- ── SpaceSetting table ───────────────────────────────────────────────────────
-- Tied to Space — owner access only.

CREATE POLICY "space_setting: owner only"
  ON "SpaceSetting"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

-- ── Contact table ────────────────────────────────────────────────────────────

CREATE POLICY "contact: space owner only"
  ON "Contact"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

-- ── Deal table ───────────────────────────────────────────────────────────────

CREATE POLICY "deal: space owner only"
  ON "Deal"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

-- ── DealStage table ──────────────────────────────────────────────────────────

CREATE POLICY "deal_stage: space owner only"
  ON "DealStage"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

-- ── DealContact junction table ───────────────────────────────────────────────

CREATE POLICY "deal_contact: via deal ownership"
  ON "DealContact"
  FOR ALL
  USING (
    "dealId" IN (
      SELECT d.id FROM "Deal" d
      JOIN "Space" s ON s.id = d."spaceId"
      WHERE s."ownerId" = current_user_internal_id()
    )
  );

-- ── Message table ────────────────────────────────────────────────────────────

CREATE POLICY "message: space owner only"
  ON "Message"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

-- ── DocumentEmbedding table ──────────────────────────────────────────────────

CREATE POLICY "embedding: space owner only"
  ON "DocumentEmbedding"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

-- ── AuditLog table (created in next migration) ───────────────────────────────
-- No policy needed — AuditLog is written ONLY by the service role and
-- should never be readable via the anon/authenticated role.
-- (Policy will be added when the table is created.)
