-- ============================================================================
-- Brokerage Billing: Per-Brokerage Seat-Based Subscriptions
-- ============================================================================
-- WHY: Previously, billing was tied to the broker_owner's personal Space. This
-- had three concrete problems: (1) invites were effectively unlimited because
-- no seat counter existed anywhere, (2) there was no way to surface team usage
-- vs. plan limits to the owner or to admins, and (3) if the owner ever
-- switched their personal Space to a solo plan (or canceled it), their entire
-- team's billing silently broke because the team's access was parasitic on a
-- row that didn't semantically represent the team.
--
-- Moving the subscription, plan, and seatLimit onto Brokerage itself closes
-- all three gaps: seats are counted against the brokerage row, usage is
-- directly queryable, and the broker_owner's personal Space billing becomes
-- independent. Note that Space.stripe* columns are intentionally retained —
-- solo realtors (non-broker accounts with no Brokerage) still bill through
-- their Space, and the Stripe webhook will route incoming events by metadata
-- to either a Brokerage or a Space depending on which flow created the sub.
-- ============================================================================

-- 1. Extend Brokerage with billing + plan columns
ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'starter'
    CHECK (plan IN ('starter', 'team', 'enterprise'));

ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "seatLimit" integer;
  -- Nullable: enterprise = unlimited. starter defaults to 5, team to 15
  -- (enforced below via UPDATE + application-layer logic on plan change).

ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "stripeCustomerId" text;

ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" text;

ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionStatus" text NOT NULL DEFAULT 'inactive'
    CHECK ("stripeSubscriptionStatus" IN ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'inactive'));

ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "stripePeriodEnd" timestamptz;

-- 2. Populate seatLimit on existing rows where it's currently NULL.
--    starter -> 5, team -> 15, enterprise -> NULL (unlimited).
UPDATE "Brokerage" SET "seatLimit" = 5  WHERE plan = 'starter' AND "seatLimit" IS NULL;
UPDATE "Brokerage" SET "seatLimit" = 15 WHERE plan = 'team'    AND "seatLimit" IS NULL;
-- enterprise: leave NULL (unlimited)

-- 3. Bootstrap existing brokerages' billing from their broker_owner's personal
--    Space subscription — but ONLY for rows that don't already have a
--    subscription on the Brokerage side. One-shot, idempotent by the guard.
--    Space.stripe* columns are intentionally left intact; solo realtors (users
--    with no Brokerage) still bill through their Space.
UPDATE "Brokerage" b
SET "stripeCustomerId"         = s."stripeCustomerId",
    "stripeSubscriptionId"     = s."stripeSubscriptionId",
    "stripeSubscriptionStatus" = s."stripeSubscriptionStatus",
    "stripePeriodEnd"          = s."stripePeriodEnd"
FROM "Space" s
WHERE s."ownerId" = b."ownerId"
  AND b."stripeSubscriptionId" IS NULL
  AND s."stripeSubscriptionId" IS NOT NULL;

-- 4. Indexes for webhook + invite lookups.
--    Partial indexes keep them small (most rows on free/inactive plans have
--    no Stripe ids). Stripe-webhook agent: use these to resolve a Brokerage
--    by subscription id or customer id in O(log n).
CREATE INDEX IF NOT EXISTS idx_brokerage_stripe_sub
  ON "Brokerage"("stripeSubscriptionId")
  WHERE "stripeSubscriptionId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_brokerage_stripe_customer
  ON "Brokerage"("stripeCustomerId")
  WHERE "stripeCustomerId" IS NOT NULL;
