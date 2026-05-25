-- Phase 10 of the deals redesign: commission split tracking.
--
-- A realtor lives and dies by commission math: gross commission income
-- (GCI), broker split, co-agent / referral split, and what lands in their
-- pocket. The existing Deal.commissionRate is a single % that's useful for
-- the per-deal GCI display but ignores every party that might take a slice.
--
-- This table stores one row per party that gets paid from a deal. Basis is
-- either 'percent' (of the deal's GCI) or 'flat' (absolute dollar amount).
-- Roles are free-form strings so users can name splits beyond the canonical
-- role catalog (e.g. "referral out to Sarah"); for convenience the canonical
-- set lives in lib/commissions.ts.
--
-- paidAt is nullable — realtors can plan splits while the deal is pending
-- and mark them paid once funded.

CREATE TABLE IF NOT EXISTS "CommissionSplit" (
  id            TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "dealId"      TEXT         NOT NULL REFERENCES "Deal"(id) ON DELETE CASCADE,
  "spaceId"     TEXT         NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  party         TEXT         NOT NULL,           -- 'me' | 'brokerage' | 'co_agent' | 'referral_out' | 'referral_in' | 'other'
  label         TEXT         NOT NULL,           -- human label, e.g. "Sarah Lee" or "Broker split"
  basis         TEXT         NOT NULL CHECK (basis IN ('percent', 'flat')),
  "percentOfGci" NUMERIC(6,3),                   -- when basis='percent', the % of GCI this party takes
  "flatAmount"  NUMERIC(14,2),                   -- when basis='flat', the absolute dollar amount
  "paidAt"      TIMESTAMPTZ,
  notes         TEXT,
  "createdAt"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "CommissionSplit_basis_values" CHECK (
    (basis = 'percent' AND "percentOfGci" IS NOT NULL AND "flatAmount" IS NULL)
    OR
    (basis = 'flat'    AND "flatAmount"  IS NOT NULL AND "percentOfGci" IS NULL)
  ),
  CONSTRAINT "CommissionSplit_percent_range" CHECK ("percentOfGci" IS NULL OR ("percentOfGci" >= 0 AND "percentOfGci" <= 100))
);

CREATE INDEX IF NOT EXISTS idx_commission_split_deal
  ON "CommissionSplit" ("dealId");

CREATE INDEX IF NOT EXISTS idx_commission_split_space_paid
  ON "CommissionSplit" ("spaceId", "paidAt");

ALTER TABLE "CommissionSplit" ENABLE ROW LEVEL SECURITY;
