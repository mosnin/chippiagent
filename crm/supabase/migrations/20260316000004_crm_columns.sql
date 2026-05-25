-- ============================================================================
-- Migration: Core CRM columns and DealActivity table
-- Adds columns that the application code references but were missing from schema
-- ============================================================================

-- ── Contact: follow-up and tracking columns ──────────────────────────────────

ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "followUpAt"      timestamptz,
  ADD COLUMN IF NOT EXISTS "lastContactedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "sourceLabel"     text,
  ADD COLUMN IF NOT EXISTS "stageChangedAt"  timestamptz;

-- ── Deal: status and follow-up columns ───────────────────────────────────────

ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'won', 'lost', 'on_hold')),
  ADD COLUMN IF NOT EXISTS "followUpAt" timestamptz;

-- ── DealActivity table ────────────────────────────────────────────────────────
-- Referenced by /api/deals/[id]/route.ts (auto-logs stage_change, status_change)
-- and /api/deals/[id]/activity/route.ts (GET/POST for manual activity entries)
-- and deal-panel.tsx Activity tab UI

CREATE TABLE IF NOT EXISTS "DealActivity" (
  id          text        PRIMARY KEY,
  "dealId"    text        NOT NULL REFERENCES "Deal"(id) ON DELETE CASCADE,
  "spaceId"   text        NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  type        text        NOT NULL
                CHECK (type IN ('note', 'call', 'email', 'meeting', 'follow_up', 'stage_change', 'status_change')),
  content     text,
  metadata    jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_deal_activity_deal    ON "DealActivity"("dealId");
CREATE INDEX IF NOT EXISTS idx_deal_activity_space   ON "DealActivity"("spaceId");
CREATE INDEX IF NOT EXISTS idx_deal_activity_type    ON "DealActivity"(type);

CREATE INDEX IF NOT EXISTS contact_follow_up_idx     ON "Contact"("spaceId", "followUpAt" DESC);
CREATE INDEX IF NOT EXISTS deal_follow_up_idx        ON "Deal"("spaceId", "followUpAt" DESC);
CREATE INDEX IF NOT EXISTS deal_status_idx           ON "Deal"("spaceId", status);

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE "DealActivity" ENABLE ROW LEVEL SECURITY;
