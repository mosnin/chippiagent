-- Phase 4 of the deals redesign: role-based contacts on a deal.
--
-- Before this, DealContact was an untyped join between Deal and Contact.
-- Every person attached to a deal was just "a contact", which loses the
-- distinction that actually matters to a realtor — "who's the lender?",
-- "who's the title company?", "who's the co-agent?".
--
-- Role is free-form text with a CHECK constraint; null is allowed so
-- existing rows don't need backfill. UI renders a dropdown of the canonical
-- set; 'other' catches anything the template doesn't cover.

ALTER TABLE "DealContact"
  ADD COLUMN IF NOT EXISTS role TEXT;

-- Soft constraint — only block obviously-wrong values. Realtor tooling can
-- evolve the role set without a migration per addition.
ALTER TABLE "DealContact"
  DROP CONSTRAINT IF EXISTS "DealContact_role_check";

ALTER TABLE "DealContact"
  ADD CONSTRAINT "DealContact_role_check"
  CHECK (role IS NULL OR role IN (
    'buyer',
    'seller',
    'buyer_agent',
    'listing_agent',
    'co_agent',
    'lender',
    'title',
    'escrow',
    'inspector',
    'appraiser',
    'attorney',
    'other'
  ));

CREATE INDEX IF NOT EXISTS idx_deal_contact_role
  ON "DealContact" ("dealId", role)
  WHERE role IS NOT NULL;
