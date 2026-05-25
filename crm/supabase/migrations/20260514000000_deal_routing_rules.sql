-- ============================================================================
-- Brokerage Deal Routing Rules: Schema (Phase BP7d — rules layer)
-- ============================================================================
-- The BP7a/b lead-routing engine picks a realtor_member via a single global
-- choice on the Brokerage row: manual, round_robin, or score_based. That
-- works for homogeneous teams, but brokerages with territorial or
-- specialty agents (rental vs buyer specialist, luxury vs starter, named
-- accounts) need to express preferences like "route every rental under
-- $3k to Sam" BEFORE the round-robin kicks in. This table lets a broker
-- describe those preferences as an ordered list of rules.
--
-- Evaluation order at routing time:
--   1. Load DealRoutingRule rows WHERE brokerageId=? AND enabled=true
--      ORDER BY priority ASC, "createdAt" ASC.
--   2. For each rule in order, check its AND-combined criteria against the
--      lead. A rule with no criteria set is a catch-all — put it last via
--      a high `priority` (e.g. 9999) if you want "fallback to a specific
--      agent before the global round-robin kicks in".
--   3. The first matching rule wins. If its destinationUserId is set and
--      the agent is still eligible (active member of this brokerage with
--      a Space), route there. Otherwise the rule is SKIPPED — the engine
--      moves on to the next rule, so an offboarded named agent doesn't
--      sink routing.
--   4. If no rule matches, fall through to the existing BP7b
--      Brokerage.assignmentMethod behaviour (round_robin / score_based /
--      manual). Existing call sites that don't pass a `lead` argument
--      naturally see the fallback because no rule with criteria can match
--      an empty input.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "DealRoutingRule" (
  id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "brokerageId"            text NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE,
  name                     text NOT NULL,
  priority                 integer NOT NULL DEFAULT 100,
  enabled                  boolean NOT NULL DEFAULT true,

  -- ── Criteria (all optional; AND-combined when multiple are set) ───────
  -- A rule with every criteria column NULL is a catch-all that matches any
  -- lead. These map 1:1 onto columns that exist on Contact today so the
  -- engine can evaluate without joining: Contact.leadType (text),
  -- Contact.budget (double precision), and Contact.tags (text[]).
  "leadType"               text,              -- e.g. 'buyer' | 'rental'; NULL = any
  "minBudget"              numeric(14, 2),    -- inclusive; NULL = no min
  "maxBudget"              numeric(14, 2),    -- inclusive; NULL = no max
  "matchTag"               text,              -- Contact.tag that must be present; NULL = any

  -- ── Destination (EXACTLY one of userId / poolMethod is set) ──────────
  -- destinationUserId routes the matching lead to a specific agent. If
  -- that agent is no longer eligible (offboarded, left the brokerage, no
  -- Space), the engine skips this rule rather than blocking the insert.
  "destinationUserId"      text REFERENCES "User"(id) ON DELETE SET NULL,

  -- destinationPoolMethod runs a mini round-robin or score selection
  -- across a subset of agents identified by `destinationPoolTag`. When
  -- the tag is NULL the pool is the full realtor_member set.
  --
  -- NOTE: as of this migration, neither User nor BrokerageMembership has
  -- a tags column, so destinationPoolTag is accepted at the schema level
  -- but IGNORED by the v1 engine (which treats it as "use the full
  -- realtor pool"). A follow-up migration can add
  -- BrokerageMembership.tags text[] and the engine will start honouring
  -- the column without changing this table.
  "destinationPoolMethod"  text
    CHECK ("destinationPoolMethod" IN ('round_robin', 'score_based')),
  "destinationPoolTag"     text,

  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),

  -- XOR between the two destination shapes — caller must pick exactly one.
  CONSTRAINT deal_routing_rule_destination_xor CHECK (
    ("destinationUserId" IS NOT NULL AND "destinationPoolMethod" IS NULL)
    OR
    ("destinationUserId" IS NULL AND "destinationPoolMethod" IS NOT NULL)
  ),

  -- Budget range sanity: when both bounds are set, max must be >= min.
  -- Either bound alone is fine.
  CONSTRAINT deal_routing_rule_budget_range CHECK (
    "minBudget" IS NULL
    OR "maxBudget" IS NULL
    OR "maxBudget" >= "minBudget"
  )
);

-- Ordered-lookup path the engine uses on every routed lead. Ordering by
-- priority ASC + a secondary on the read side (createdAt ASC) is stable
-- enough for the partial index to remain small.
CREATE INDEX IF NOT EXISTS idx_deal_routing_rule_brokerage_priority
  ON "DealRoutingRule" ("brokerageId", priority ASC, enabled);

-- Filtering index for the settings UI list (which shows disabled rules too).
CREATE INDEX IF NOT EXISTS idx_deal_routing_rule_brokerage_enabled
  ON "DealRoutingRule" ("brokerageId", enabled);
