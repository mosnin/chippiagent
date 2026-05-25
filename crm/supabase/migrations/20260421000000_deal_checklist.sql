-- Phase 2 of the deals redesign: a typed closing checklist per deal.
--
-- Existing Deal.milestones (JSONB) is kept for backward compatibility but
-- supplanted in the UI by this table. Items are typed via `kind` so we can:
--   * auto-seed a standard residential flow from a template
--   * render canonical icons/descriptions per kind
--   * surface "X/Y items · next: inspection Thu" chips on cards
--
-- No RLS policies — server-side filtering by spaceId (service-role pattern
-- used elsewhere in this repo). RLS is enabled so direct client access fails.

CREATE TABLE IF NOT EXISTS "DealChecklistItem" (
  id            TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "dealId"      TEXT         NOT NULL REFERENCES "Deal"(id) ON DELETE CASCADE,
  "spaceId"     TEXT         NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  kind          TEXT         NOT NULL,          -- 'earnest_money' | 'inspection' | 'appraisal' | 'loan_commitment' | 'clear_to_close' | 'final_walkthrough' | 'closing' | 'custom'
  label         TEXT         NOT NULL,
  "dueAt"       TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  position      INTEGER      NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_checklist_deal
  ON "DealChecklistItem" ("dealId", position);

CREATE INDEX IF NOT EXISTS idx_deal_checklist_space
  ON "DealChecklistItem" ("spaceId");

-- Items due soon / overdue — used by the Today inbox and the card chip.
CREATE INDEX IF NOT EXISTS idx_deal_checklist_due_open
  ON "DealChecklistItem" ("spaceId", "dueAt")
  WHERE "completedAt" IS NULL;

ALTER TABLE "DealChecklistItem" ENABLE ROW LEVEL SECURITY;
