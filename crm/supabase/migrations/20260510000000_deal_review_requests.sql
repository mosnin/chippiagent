-- ============================================================================
-- Deal Review Requests: Broker Sign-Off On High-Stakes Deals
-- ============================================================================
-- WHY: Today brokers can't be pinged for sign-off on a specific deal. Agents
-- run high-stakes transactions (unusual commission splits, aggressive price
-- concessions, atypical contingencies) past their broker over Slack or in
-- person, leaving no audit trail and no structured queue on the broker side.
-- High-stakes deals effectively fly blind — the broker only finds out when
-- something goes wrong at closing.
--
-- BP5 introduces a deal-scoped review flow: an agent clicks "Flag for broker
-- review" on a deal, a DealReviewRequest row lands here, a BrokerNotification
-- fires (handled by the API agent), and the broker works through the queue at
-- /broker/reviews. DealReviewComment captures the back-and-forth so the
-- approval/denial conversation is captured alongside the deal itself. A
-- partial unique index enforces at most one OPEN review per deal so agents
-- can't spam the broker queue with duplicate flags on the same deal.
-- ============================================================================

-- 1. DealReviewRequest — one row per "flag this deal for broker review".
CREATE TABLE IF NOT EXISTS "DealReviewRequest" (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "dealId"            text NOT NULL REFERENCES "Deal"(id) ON DELETE CASCADE,
  "requestingUserId"  text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "brokerageId"       text NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'approved', 'closed')),
  reason              text NOT NULL,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "resolvedAt"        timestamptz,
  "resolvedByUserId"  text REFERENCES "User"(id) ON DELETE SET NULL,
  "resolvedNote"      text
);

-- Defensive ADD COLUMN IF NOT EXISTS for re-run safety if the table already
-- exists from a prior partial run.
ALTER TABLE "DealReviewRequest"
  ADD COLUMN IF NOT EXISTS "dealId" text;
ALTER TABLE "DealReviewRequest"
  ADD COLUMN IF NOT EXISTS "requestingUserId" text;
ALTER TABLE "DealReviewRequest"
  ADD COLUMN IF NOT EXISTS "brokerageId" text;
ALTER TABLE "DealReviewRequest"
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';
ALTER TABLE "DealReviewRequest"
  ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE "DealReviewRequest"
  ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "DealReviewRequest"
  ADD COLUMN IF NOT EXISTS "resolvedAt" timestamptz;
ALTER TABLE "DealReviewRequest"
  ADD COLUMN IF NOT EXISTS "resolvedByUserId" text;
ALTER TABLE "DealReviewRequest"
  ADD COLUMN IF NOT EXISTS "resolvedNote" text;

-- 2. DealReviewComment — threaded back-and-forth between broker and agent.
CREATE TABLE IF NOT EXISTS "DealReviewComment" (
  id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "reviewRequestId" text NOT NULL REFERENCES "DealReviewRequest"(id) ON DELETE CASCADE,
  "authorUserId"    text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  body              text NOT NULL,
  "createdAt"       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "DealReviewComment"
  ADD COLUMN IF NOT EXISTS "reviewRequestId" text;
ALTER TABLE "DealReviewComment"
  ADD COLUMN IF NOT EXISTS "authorUserId" text;
ALTER TABLE "DealReviewComment"
  ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE "DealReviewComment"
  ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();

-- 3. Indexes — the only query shapes that matter.
--    (a) Broker's queue: filter by brokerage + status, usually status='open'.
CREATE INDEX IF NOT EXISTS idx_dealreview_brokerage_status
  ON "DealReviewRequest"("brokerageId", status);

--    (b) "Does this deal already have any review?" lookup + FK support.
CREATE INDEX IF NOT EXISTS idx_dealreview_deal
  ON "DealReviewRequest"("dealId");

--    (c) Thread rendering for a single review request, in chronological order.
CREATE INDEX IF NOT EXISTS idx_dealreviewcomment_request_created
  ON "DealReviewComment"("reviewRequestId", "createdAt");

--    (d) Partial unique index: only ONE open review per deal at a time.
--        API agent: inserts that collide with this must be translated to a
--        409 Conflict response. Tests agent: this is the invariant to assert
--        — attempting a second 'open' DealReviewRequest for the same dealId
--        must raise a unique-violation (Postgres SQLSTATE 23505).
CREATE UNIQUE INDEX IF NOT EXISTS idx_dealreview_open_per_deal
  ON "DealReviewRequest"("dealId") WHERE status = 'open';

-- 4. RLS — defense-in-depth only.
--    The BP5 API routes use the Supabase service-role key and enforce access
--    (brokerage membership, agent-owns-deal, broker-owns-brokerage) at the
--    route layer. RLS is enabled here purely to block direct client-side
--    reads/writes via the anon key; no policies are defined for MVP because
--    no code path should ever hit these tables with a non-service role. If
--    and when we expose direct client queries (e.g. via PostgREST or the
--    supabase-js client from the browser), add policies in a follow-up
--    migration — do NOT loosen the enable here.
ALTER TABLE "DealReviewRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealReviewComment" ENABLE ROW LEVEL SECURITY;
