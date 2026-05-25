-- Migration: Add Stripe billing columns to Space table
-- Stores Stripe customer and subscription IDs so we can gate access

ALTER TABLE "Space"
  ADD COLUMN IF NOT EXISTS "stripeCustomerId"     text,
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionId"  text,
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionStatus" text
    DEFAULT 'inactive'
    CHECK ("stripeSubscriptionStatus" IN (
      'active', 'trialing', 'past_due', 'canceled', 'unpaid', 'inactive'
    )),
  ADD COLUMN IF NOT EXISTS "stripePeriodEnd"       timestamptz;

CREATE INDEX IF NOT EXISTS idx_space_stripe_customer
  ON "Space" ("stripeCustomerId");

CREATE INDEX IF NOT EXISTS idx_space_stripe_subscription
  ON "Space" ("stripeSubscriptionId");
