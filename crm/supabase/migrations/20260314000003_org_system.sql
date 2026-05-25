-- ============================================================================
-- Organization System: Brokerages, Memberships, Invitations
-- ============================================================================
-- Adds:
--   1. User.platformRole (user | admin) — replaces Clerk-metadata-only admin
--   2. Brokerage table
--   3. BrokerageMembership table
--   4. Space.brokerageId (nullable link to Brokerage)
--   5. Invitation table
--
-- All new columns have safe defaults so existing rows are unaffected.
-- ============================================================================

-- 1. Add platform_role to User (defaults 'user' — all existing users safe)
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "platformRole" text NOT NULL DEFAULT 'user'
  CHECK ("platformRole" IN ('user', 'admin'));

-- 2. Brokerage
CREATE TABLE IF NOT EXISTS "Brokerage" (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name          text NOT NULL,
  "ownerId"     text NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  "websiteUrl"  text,
  "logoUrl"     text,
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);
-- One brokerage per owner
CREATE UNIQUE INDEX IF NOT EXISTS idx_brokerage_owner  ON "Brokerage"("ownerId");
CREATE INDEX       IF NOT EXISTS idx_brokerage_status  ON "Brokerage"(status);

-- 3. BrokerageMembership
CREATE TABLE IF NOT EXISTS "BrokerageMembership" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "brokerageId"   text NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE,
  "userId"        text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('broker_owner', 'broker_manager', 'realtor_member')),
  "invitedById"   text REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("brokerageId", "userId")
);
CREATE INDEX IF NOT EXISTS idx_membership_brokerage ON "BrokerageMembership"("brokerageId");
CREATE INDEX IF NOT EXISTS idx_membership_user      ON "BrokerageMembership"("userId");

-- 4. Link Space → Brokerage (nullable — all existing spaces untouched)
ALTER TABLE "Space"
  ADD COLUMN IF NOT EXISTS "brokerageId" text REFERENCES "Brokerage"(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_space_brokerage ON "Space"("brokerageId");

-- 5. Invitation
CREATE TABLE IF NOT EXISTS "Invitation" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "brokerageId"   text NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE,
  email           text NOT NULL,
  "roleToAssign"  text NOT NULL CHECK ("roleToAssign" IN ('broker_manager', 'realtor_member')),
  token           text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  "expiresAt"     timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  "invitedById"   text REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt"     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invitation_brokerage ON "Invitation"("brokerageId");
CREATE INDEX IF NOT EXISTS idx_invitation_email     ON "Invitation"(email);
CREATE INDEX IF NOT EXISTS idx_invitation_token     ON "Invitation"(token);
CREATE INDEX IF NOT EXISTS idx_invitation_status    ON "Invitation"(status);

-- 6. RLS for new tables (defense-in-depth; service role bypasses these)
ALTER TABLE "Brokerage"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrokerageMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation"          ENABLE ROW LEVEL SECURITY;
