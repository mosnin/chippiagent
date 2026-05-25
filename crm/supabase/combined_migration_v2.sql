-- ============================================================================
-- COMBINED MIGRATION v2: migrations 20260426 through 20260602
-- Fully idempotent — safe to run multiple times.
-- Run in Supabase SQL editor: Dashboard → SQL Editor → New query → paste → Run
-- ============================================================================

-- ── 1. Message.blocks (20260426000000) ────────────────────────────────────────
ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "blocks" JSONB;

-- ── 2. Attachment table (20260430120000) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Attachment" (
  id                   TEXT PRIMARY KEY,
  "spaceId"            TEXT NOT NULL,
  "userId"             TEXT,
  "conversationId"     TEXT,
  filename             TEXT NOT NULL,
  "mimeType"           TEXT NOT NULL,
  "sizeBytes"          INT NOT NULL,
  "storagePath"        TEXT NOT NULL,
  "publicUrl"          TEXT NOT NULL,
  "extractedText"      TEXT,
  "extractionStatus"   TEXT NOT NULL DEFAULT 'pending'
    CHECK ("extractionStatus" IN ('pending','skipped','done','failed')),
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "Attachment_spaceId_createdAt_idx"
  ON "Attachment" ("spaceId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Attachment_conversationId_idx"
  ON "Attachment" ("conversationId")
  WHERE "conversationId" IS NOT NULL;

-- ── 3. Brokerage offboarding (20260506000000) ─────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'offboarded'));

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "offboardedAt" timestamptz;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "offboardedToUserId" text
    REFERENCES "User"(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION offboard_brokerage_member(
  p_leaving_user_id     text,
  p_destination_user_id text,
  p_brokerage_id        text,
  p_dry_run             boolean DEFAULT false
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leaving_space_id     text;
  v_destination_space_id text;
  v_contact_count        integer := 0;
  v_deal_count           integer := 0;
  v_tour_count           integer := 0;
  v_open_tour_count      integer := 0;
BEGIN
  SELECT id INTO v_leaving_space_id
    FROM "Space" WHERE "ownerId" = p_leaving_user_id FOR UPDATE;
  IF v_leaving_space_id IS NULL THEN
    RAISE EXCEPTION 'Leaving user % has no Space row; cannot offboard', p_leaving_user_id;
  END IF;
  SELECT id INTO v_destination_space_id
    FROM "Space" WHERE "ownerId" = p_destination_user_id FOR UPDATE;
  IF v_destination_space_id IS NULL THEN
    RAISE EXCEPTION 'Destination user % has no Space row; cannot receive transfer', p_destination_user_id;
  END IF;
  IF v_leaving_space_id = v_destination_space_id THEN
    RAISE EXCEPTION 'Leaving and destination users resolve to the same Space (%); nothing to transfer', v_leaving_space_id;
  END IF;
  IF p_dry_run THEN
    SELECT COUNT(*) INTO v_contact_count FROM "Contact"
      WHERE "spaceId" = v_leaving_space_id AND "brokerageId" = p_brokerage_id;
    SELECT COUNT(DISTINCT d.id) INTO v_deal_count FROM "Deal" d
      WHERE d."spaceId" = v_leaving_space_id
        AND d.id IN (SELECT dc."dealId" FROM "DealContact" dc
          JOIN "Contact" c ON c.id = dc."contactId"
          WHERE c."spaceId" = v_leaving_space_id AND c."brokerageId" = p_brokerage_id);
    SELECT COUNT(*) INTO v_open_tour_count FROM "Tour" t
      JOIN "Contact" c ON c.id = t."contactId"
      WHERE t."spaceId" = v_leaving_space_id AND c."spaceId" = v_leaving_space_id
        AND c."brokerageId" = p_brokerage_id AND t."startsAt" >= now();
    RETURN json_build_object('dryRun', true, 'contactCount', v_contact_count,
      'dealCount', v_deal_count, 'openTourCount', v_open_tour_count);
  END IF;
  CREATE TEMP TABLE _moved_contacts ON COMMIT DROP AS
  WITH moved AS (
    UPDATE "Contact" SET "spaceId" = v_destination_space_id
    WHERE "spaceId" = v_leaving_space_id AND "brokerageId" = p_brokerage_id
    RETURNING id) SELECT id FROM moved;
  GET DIAGNOSTICS v_contact_count = ROW_COUNT;
  UPDATE "ContactActivity" SET "spaceId" = v_destination_space_id
    WHERE "contactId" IN (SELECT id FROM _moved_contacts);
  CREATE TEMP TABLE _moved_deals ON COMMIT DROP AS
  WITH moved AS (
    UPDATE "Deal" SET "spaceId" = v_destination_space_id
    WHERE "spaceId" = v_leaving_space_id
      AND id IN (SELECT DISTINCT "dealId" FROM "DealContact"
        WHERE "contactId" IN (SELECT id FROM _moved_contacts))
    RETURNING id) SELECT id FROM moved;
  GET DIAGNOSTICS v_deal_count = ROW_COUNT;
  UPDATE "DealActivity" SET "spaceId" = v_destination_space_id
    WHERE "dealId" IN (SELECT id FROM _moved_deals);
  UPDATE "DealChecklistItem" SET "spaceId" = v_destination_space_id
    WHERE "dealId" IN (SELECT id FROM _moved_deals);
  WITH moved AS (
    UPDATE "Tour" SET "spaceId" = v_destination_space_id
    WHERE "spaceId" = v_leaving_space_id
      AND "contactId" IN (SELECT id FROM _moved_contacts)
    RETURNING 1)
  SELECT COUNT(*) INTO v_tour_count FROM moved;
  UPDATE "User" SET status = 'offboarded', "offboardedAt" = now(),
    "offboardedToUserId" = p_destination_user_id WHERE id = p_leaving_user_id;
  DELETE FROM "BrokerageMembership"
    WHERE "userId" = p_leaving_user_id AND "brokerageId" = p_brokerage_id;
  RETURN json_build_object('dryRun', false, 'contactsMoved', v_contact_count,
    'dealsMoved', v_deal_count, 'toursMoved', v_tour_count);
END;
$$;

GRANT EXECUTE ON FUNCTION offboard_brokerage_member(text, text, text, boolean)
  TO authenticated, service_role;

-- ── 4. Commission ledger (20260507000000) ─────────────────────────────────────
ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "defaultAgentRate"  numeric(5,2) NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS "defaultBrokerRate" numeric(5,2) NOT NULL DEFAULT 0.5;

CREATE TABLE IF NOT EXISTS "CommissionLedger" (
  id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "brokerageId"    text NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE,
  "agentUserId"    text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "dealId"         text NOT NULL REFERENCES "Deal"(id) ON DELETE CASCADE,
  "closedAt"       timestamptz NOT NULL,
  "dealValue"      numeric(12,2) NOT NULL,
  "agentRate"      numeric(5,2) NOT NULL,
  "brokerRate"     numeric(5,2) NOT NULL,
  "referralRate"   numeric(5,2) NOT NULL DEFAULT 0,
  "referralUserId" text REFERENCES "User"(id) ON DELETE SET NULL,
  "agentAmount"    numeric(12,2) NOT NULL,
  "brokerAmount"   numeric(12,2) NOT NULL,
  "referralAmount" numeric(12,2) NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','paid','void')),
  "payoutAt"       timestamptz,
  notes            text,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("dealId")
);

CREATE INDEX IF NOT EXISTS idx_commission_brokerage
  ON "CommissionLedger" ("brokerageId", "closedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_commission_agent
  ON "CommissionLedger" ("agentUserId", "closedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_commission_status
  ON "CommissionLedger" (status);

CREATE OR REPLACE FUNCTION sync_commission_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_brokerage_id text; v_owner_id text;
  v_agent_rate numeric(5,2); v_broker_rate numeric(5,2);
  v_deal_value numeric(12,2);
BEGIN
  SELECT s."brokerageId", s."ownerId" INTO v_brokerage_id, v_owner_id
    FROM "Space" s WHERE s.id = NEW."spaceId";
  IF v_brokerage_id IS NULL THEN RETURN NEW; END IF;
  SELECT b."defaultAgentRate", b."defaultBrokerRate" INTO v_agent_rate, v_broker_rate
    FROM "Brokerage" b WHERE b.id = v_brokerage_id;
  IF v_agent_rate IS NULL OR v_broker_rate IS NULL THEN RETURN NEW; END IF;
  v_deal_value := COALESCE(NEW.value, 0);
  INSERT INTO "CommissionLedger" ("brokerageId","agentUserId","dealId","closedAt",
    "dealValue","agentRate","brokerRate","referralRate","agentAmount","brokerAmount",
    "referralAmount",status)
  VALUES (v_brokerage_id, v_owner_id, NEW.id, now(), v_deal_value, v_agent_rate,
    v_broker_rate, 0,
    ROUND((v_deal_value * v_agent_rate / 100)::numeric, 2),
    ROUND((v_deal_value * v_broker_rate / 100)::numeric, 2),
    0, 'pending')
  ON CONFLICT ("dealId") DO NOTHING;
  RETURN NEW;
END; $$;

GRANT EXECUTE ON FUNCTION sync_commission_ledger() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_deal_won_insert ON "Deal";
CREATE TRIGGER trg_deal_won_insert
  AFTER INSERT ON "Deal" FOR EACH ROW
  WHEN (NEW.status = 'won')
  EXECUTE FUNCTION sync_commission_ledger();

DROP TRIGGER IF EXISTS trg_deal_won_update ON "Deal";
CREATE TRIGGER trg_deal_won_update
  AFTER UPDATE OF status ON "Deal" FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'won')
  EXECUTE FUNCTION sync_commission_ledger();

INSERT INTO "CommissionLedger" ("brokerageId","agentUserId","dealId","closedAt",
  "dealValue","agentRate","brokerRate","referralRate","agentAmount","brokerAmount",
  "referralAmount",status)
SELECT s."brokerageId", s."ownerId", d.id, COALESCE(d."updatedAt", now()),
  COALESCE(d.value, 0), b."defaultAgentRate", b."defaultBrokerRate", 0,
  ROUND((COALESCE(d.value,0) * b."defaultAgentRate" / 100)::numeric, 2),
  ROUND((COALESCE(d.value,0) * b."defaultBrokerRate" / 100)::numeric, 2),
  0, 'pending'
FROM "Deal" d
JOIN "Space" s ON s.id = d."spaceId"
JOIN "Brokerage" b ON b.id = s."brokerageId"
WHERE d.status = 'won' AND s."brokerageId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "CommissionLedger" cl WHERE cl."dealId" = d.id);

ALTER TABLE "CommissionLedger" ENABLE ROW LEVEL SECURITY;

-- ── 5. Offboarding hardening (20260508000000) ─────────────────────────────────
REVOKE EXECUTE ON FUNCTION offboard_brokerage_member(text, text, text, boolean)
  FROM authenticated;

CREATE OR REPLACE FUNCTION offboard_brokerage_member(
  p_leaving_user_id     text,
  p_destination_user_id text,
  p_brokerage_id        text,
  p_dry_run             boolean DEFAULT false
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_leaving_space_id text; v_destination_space_id text;
  v_contact_count integer := 0; v_deal_count integer := 0;
  v_tour_count integer := 0; v_open_tour_count integer := 0;
  v_dest_status text;
BEGIN
  SELECT id INTO v_leaving_space_id
    FROM "Space" WHERE "ownerId" = p_leaving_user_id FOR UPDATE;
  IF v_leaving_space_id IS NULL THEN
    RAISE EXCEPTION 'Leaving user % has no Space row; cannot offboard', p_leaving_user_id;
  END IF;
  SELECT s.id, u.status INTO v_destination_space_id, v_dest_status
    FROM "Space" s JOIN "User" u ON u.id = s."ownerId"
    WHERE s."ownerId" = p_destination_user_id FOR UPDATE;
  IF v_destination_space_id IS NULL THEN
    RAISE EXCEPTION 'Destination user % has no Space row; cannot receive transfer', p_destination_user_id;
  END IF;
  IF v_dest_status = 'offboarded' THEN
    RAISE EXCEPTION 'Destination user % is already offboarded; cannot transfer to an inactive user', p_destination_user_id;
  END IF;
  IF v_leaving_space_id = v_destination_space_id THEN
    RAISE EXCEPTION 'Leaving and destination users resolve to the same Space (%); nothing to transfer', v_leaving_space_id;
  END IF;
  IF p_dry_run THEN
    SELECT COUNT(*) INTO v_contact_count FROM "Contact"
      WHERE "spaceId" = v_leaving_space_id AND "brokerageId" = p_brokerage_id;
    SELECT COUNT(DISTINCT d.id) INTO v_deal_count FROM "Deal" d
      WHERE d."spaceId" = v_leaving_space_id
        AND d.id IN (SELECT dc."dealId" FROM "DealContact" dc
          JOIN "Contact" c ON c.id = dc."contactId"
          WHERE c."spaceId" = v_leaving_space_id AND c."brokerageId" = p_brokerage_id);
    SELECT COUNT(*) INTO v_open_tour_count FROM "Tour" t
      JOIN "Contact" c ON c.id = t."contactId"
      WHERE t."spaceId" = v_leaving_space_id AND c."spaceId" = v_leaving_space_id
        AND c."brokerageId" = p_brokerage_id AND t."startsAt" >= now();
    RETURN json_build_object('dryRun', true, 'contactCount', v_contact_count,
      'dealCount', v_deal_count, 'openTourCount', v_open_tour_count);
  END IF;
  CREATE TEMP TABLE _moved_contacts ON COMMIT DROP AS
  WITH moved AS (
    UPDATE "Contact" SET "spaceId" = v_destination_space_id
    WHERE "spaceId" = v_leaving_space_id AND "brokerageId" = p_brokerage_id
    RETURNING id) SELECT id FROM moved;
  GET DIAGNOSTICS v_contact_count = ROW_COUNT;
  UPDATE "ContactActivity" SET "spaceId" = v_destination_space_id
    WHERE "contactId" IN (SELECT id FROM _moved_contacts);
  CREATE TEMP TABLE _moved_deals ON COMMIT DROP AS
  WITH moved AS (
    UPDATE "Deal" SET "spaceId" = v_destination_space_id
    WHERE "spaceId" = v_leaving_space_id
      AND id IN (SELECT DISTINCT "dealId" FROM "DealContact"
        WHERE "contactId" IN (SELECT id FROM _moved_contacts))
    RETURNING id) SELECT id FROM moved;
  GET DIAGNOSTICS v_deal_count = ROW_COUNT;
  UPDATE "DealActivity" SET "spaceId" = v_destination_space_id
    WHERE "dealId" IN (SELECT id FROM _moved_deals);
  UPDATE "DealChecklistItem" SET "spaceId" = v_destination_space_id
    WHERE "dealId" IN (SELECT id FROM _moved_deals);
  WITH moved AS (
    UPDATE "Tour" SET "spaceId" = v_destination_space_id
    WHERE "spaceId" = v_leaving_space_id
      AND "contactId" IN (SELECT id FROM _moved_contacts)
    RETURNING 1)
  SELECT COUNT(*) INTO v_tour_count FROM moved;
  UPDATE "User" SET status = 'offboarded', "offboardedAt" = now(),
    "offboardedToUserId" = p_destination_user_id WHERE id = p_leaving_user_id;
  DELETE FROM "BrokerageMembership"
    WHERE "userId" = p_leaving_user_id AND "brokerageId" = p_brokerage_id;
  RETURN json_build_object('dryRun', false, 'contactsMoved', v_contact_count,
    'dealsMoved', v_deal_count, 'toursMoved', v_tour_count);
END; $$;

-- ── 6. Brokerage billing (20260509000000) ─────────────────────────────────────
ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'starter'
    CHECK (plan IN ('starter', 'team', 'enterprise'));

ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "seatLimit" integer;

ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "stripeCustomerId" text;

ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" text;

ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionStatus" text NOT NULL DEFAULT 'inactive'
    CHECK ("stripeSubscriptionStatus" IN ('active','trialing','past_due','canceled','unpaid','inactive'));

ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "stripePeriodEnd" timestamptz;

UPDATE "Brokerage" SET "seatLimit" = 5  WHERE plan = 'starter' AND "seatLimit" IS NULL;
UPDATE "Brokerage" SET "seatLimit" = 15 WHERE plan = 'team'    AND "seatLimit" IS NULL;

UPDATE "Brokerage" b
SET "stripeCustomerId"         = s."stripeCustomerId",
    "stripeSubscriptionId"     = s."stripeSubscriptionId",
    "stripeSubscriptionStatus" = s."stripeSubscriptionStatus",
    "stripePeriodEnd"          = s."stripePeriodEnd"
FROM "Space" s
WHERE s."ownerId" = b."ownerId"
  AND b."stripeSubscriptionId" IS NULL
  AND s."stripeSubscriptionId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_brokerage_stripe_sub
  ON "Brokerage"("stripeSubscriptionId")
  WHERE "stripeSubscriptionId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_brokerage_stripe_customer
  ON "Brokerage"("stripeCustomerId")
  WHERE "stripeCustomerId" IS NOT NULL;

-- ── 7. Deal review requests (20260510000000) ──────────────────────────────────
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

CREATE TABLE IF NOT EXISTS "DealReviewComment" (
  id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "reviewRequestId" text NOT NULL REFERENCES "DealReviewRequest"(id) ON DELETE CASCADE,
  "authorUserId"    text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  body              text NOT NULL,
  "createdAt"       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dealreview_brokerage_status
  ON "DealReviewRequest"("brokerageId", status);
CREATE INDEX IF NOT EXISTS idx_dealreview_deal
  ON "DealReviewRequest"("dealId");
CREATE INDEX IF NOT EXISTS idx_dealreviewcomment_request_created
  ON "DealReviewComment"("reviewRequestId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS idx_dealreview_open_per_deal
  ON "DealReviewRequest"("dealId") WHERE status = 'open';

ALTER TABLE "DealReviewRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealReviewComment" ENABLE ROW LEVEL SECURITY;

-- ── 8. Brokerage templates (20260511000000) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "BrokerageTemplate" (
  id                 text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "brokerageId"      text        NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE,
  name               text        NOT NULL,
  category           text        NOT NULL CHECK (category IN ('follow-up','intro','closing','tour-invite')),
  channel            text        NOT NULL CHECK (channel IN ('sms','email','note')),
  subject            text,
  body               text        NOT NULL,
  version            integer     NOT NULL DEFAULT 1,
  "publishedAt"      timestamptz,
  "publishedCount"   integer     NOT NULL DEFAULT 0,
  "createdByUserId"  text        REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "MessageTemplate"
  ADD COLUMN IF NOT EXISTS "sourceTemplateId" text REFERENCES "BrokerageTemplate"(id) ON DELETE SET NULL;

ALTER TABLE "MessageTemplate"
  ADD COLUMN IF NOT EXISTS "sourceVersion" integer;

CREATE INDEX IF NOT EXISTS idx_brokerage_template_brokerage_updated
  ON "BrokerageTemplate" ("brokerageId", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS idx_message_template_source
  ON "MessageTemplate" ("sourceTemplateId")
  WHERE "sourceTemplateId" IS NOT NULL;

-- Data migration from legacy '[BROKER_TEMPLATES]' Note rows (idempotent)
DO $$
DECLARE
  note_rec record; tmpl jsonb;
  v_brokerage_id text; v_name text; v_category text; v_body text;
  v_created_by_raw text; v_created_by text; v_parsed jsonb;
BEGIN
  FOR note_rec IN
    SELECT n.id AS note_id, n.content, n."spaceId", s."brokerageId" AS brokerage_id
    FROM "Note" n JOIN "Space" s ON s.id = n."spaceId"
    WHERE n.title = '[BROKER_TEMPLATES]'
  LOOP
    IF note_rec.brokerage_id IS NULL THEN CONTINUE; END IF;
    BEGIN v_parsed := note_rec.content::jsonb;
    EXCEPTION WHEN others THEN CONTINUE;
    END;
    IF v_parsed IS NULL OR jsonb_typeof(v_parsed) <> 'array' THEN CONTINUE; END IF;
    v_brokerage_id := note_rec.brokerage_id;
    FOR tmpl IN SELECT * FROM jsonb_array_elements(v_parsed)
    LOOP
      v_name := NULLIF(tmpl->>'name',''); v_category := NULLIF(tmpl->>'category','');
      v_body := NULLIF(tmpl->>'body',''); v_created_by_raw := NULLIF(tmpl->>'createdBy','');
      IF v_name IS NULL OR v_body IS NULL OR v_category IS NULL THEN CONTINUE; END IF;
      IF v_category NOT IN ('follow-up','intro','closing','tour-invite') THEN CONTINUE; END IF;
      v_created_by := NULL;
      IF v_created_by_raw IS NOT NULL THEN
        SELECT u.id INTO v_created_by FROM "User" u WHERE u.id = v_created_by_raw LIMIT 1;
        IF v_created_by IS NULL THEN
          SELECT u.id INTO v_created_by FROM "User" u WHERE u."clerkId" = v_created_by_raw LIMIT 1;
        END IF;
      END IF;
      INSERT INTO "BrokerageTemplate" ("brokerageId",name,category,channel,subject,body,
        version,"publishedAt","publishedCount","createdByUserId")
      SELECT v_brokerage_id,v_name,v_category,'note',NULL,v_body,1,NULL,0,v_created_by
      WHERE NOT EXISTS (SELECT 1 FROM "BrokerageTemplate" bt
        WHERE bt."brokerageId" = v_brokerage_id AND bt.name = v_name);
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE "BrokerageTemplate" ENABLE ROW LEVEL SECURITY;

-- ── 9. Template published version (20260512000000) ────────────────────────────
ALTER TABLE "BrokerageTemplate"
  ADD COLUMN IF NOT EXISTS "publishedVersion" integer;

UPDATE "BrokerageTemplate"
   SET "publishedVersion" = version
 WHERE "publishedAt" IS NOT NULL AND "publishedVersion" IS NULL;

-- ── 10. Brokerage routing (20260513000000) ────────────────────────────────────
ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "autoAssignEnabled" boolean NOT NULL DEFAULT false;

ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "assignmentMethod" text NOT NULL DEFAULT 'manual'
    CHECK ("assignmentMethod" IN ('manual','round_robin','score_based'));

ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "lastAssignedUserId" text
    REFERENCES "User"(id) ON DELETE SET NULL;

-- ── 11. Deal routing rules (20260514000000) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "DealRoutingRule" (
  id                      text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "brokerageId"           text NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE,
  name                    text NOT NULL,
  priority                integer NOT NULL DEFAULT 100,
  enabled                 boolean NOT NULL DEFAULT true,
  "leadType"              text,
  "minBudget"             numeric(14,2),
  "maxBudget"             numeric(14,2),
  "matchTag"              text,
  "destinationUserId"     text REFERENCES "User"(id) ON DELETE SET NULL,
  "destinationPoolMethod" text CHECK ("destinationPoolMethod" IN ('round_robin','score_based')),
  "destinationPoolTag"    text,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_routing_rule_destination_xor CHECK (
    ("destinationUserId" IS NOT NULL AND "destinationPoolMethod" IS NULL)
    OR ("destinationUserId" IS NULL AND "destinationPoolMethod" IS NOT NULL)
  ),
  CONSTRAINT deal_routing_rule_budget_range CHECK (
    "minBudget" IS NULL OR "maxBudget" IS NULL OR "maxBudget" >= "minBudget"
  )
);

CREATE INDEX IF NOT EXISTS idx_deal_routing_rule_brokerage_priority
  ON "DealRoutingRule" ("brokerageId", priority ASC, enabled);
CREATE INDEX IF NOT EXISTS idx_deal_routing_rule_brokerage_enabled
  ON "DealRoutingRule" ("brokerageId", enabled);

-- ── 12. Routing rules hardening (20260515000000) ──────────────────────────────
ALTER TABLE "DealRoutingRule" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE v_con_name text;
BEGIN
  SELECT con.conname INTO v_con_name
    FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'DealRoutingRule' AND con.contype = 'f'
     AND con.confrelid = (SELECT oid FROM pg_class WHERE relname = 'User')
     AND array_length(con.conkey,1) = 1
     AND (SELECT attname FROM pg_attribute
           WHERE attrelid = con.conrelid AND attnum = con.conkey[1]) = 'destinationUserId';
  IF v_con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "DealRoutingRule" DROP CONSTRAINT %I', v_con_name);
  END IF;
END $$;

ALTER TABLE "DealRoutingRule"
  ADD CONSTRAINT "DealRoutingRule_destinationUserId_fkey"
  FOREIGN KEY ("destinationUserId") REFERENCES "User"(id) ON DELETE CASCADE;

-- ── 13. Agent per-agent autonomy (20260516000000) ─────────────────────────────
ALTER TABLE "AgentSettings"
  ADD COLUMN IF NOT EXISTS "perAgentAutonomy" JSONB NOT NULL DEFAULT '{}';

-- ── 14. Agentic features (20260517000000) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AgentGoal" (
  "id"           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "spaceId"      TEXT        NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "contactId"    TEXT        REFERENCES "Contact"("id") ON DELETE SET NULL,
  "dealId"       TEXT        REFERENCES "Deal"("id") ON DELETE SET NULL,
  "goalType"     VARCHAR(50) NOT NULL CHECK ("goalType" IN ('follow_up_sequence','tour_booking','offer_progress','deal_close','reengagement','custom')),
  "description"  TEXT        NOT NULL,
  "instructions" TEXT,
  "status"       VARCHAR(20) NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','completed','cancelled','paused')),
  "priority"     INTEGER     NOT NULL DEFAULT 0,
  "metadata"     JSONB       NOT NULL DEFAULT '{}',
  "completedAt"  TIMESTAMPTZ,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "AgentGoal_spaceId_status_idx" ON "AgentGoal"("spaceId", "status");
CREATE INDEX IF NOT EXISTS "AgentGoal_contactId_idx"      ON "AgentGoal"("contactId") WHERE "contactId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "AgentGoal_dealId_idx"         ON "AgentGoal"("dealId")    WHERE "dealId"    IS NOT NULL;

CREATE TABLE IF NOT EXISTS "AgentQuestion" (
  "id"          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "spaceId"     TEXT         NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "runId"       VARCHAR(100) NOT NULL,
  "agentType"   VARCHAR(50)  NOT NULL,
  "question"    TEXT         NOT NULL,
  "context"     TEXT,
  "status"      VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','answered','expired')),
  "answer"      TEXT,
  "answeredAt"  TIMESTAMPTZ,
  "priority"    INTEGER      NOT NULL DEFAULT 0,
  "contactId"   TEXT         REFERENCES "Contact"("id") ON DELETE SET NULL,
  "createdAt"   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "AgentQuestion_spaceId_status_idx" ON "AgentQuestion"("spaceId", "status");
CREATE INDEX IF NOT EXISTS "AgentQuestion_contactId_idx"      ON "AgentQuestion"("contactId") WHERE "contactId" IS NOT NULL;

ALTER TABLE "AgentDraft"
  ADD COLUMN IF NOT EXISTS "confidence"        INTEGER CHECK ("confidence" >= 0 AND "confidence" <= 100),
  ADD COLUMN IF NOT EXISTS "outcome"           VARCHAR(30) CHECK ("outcome" IN ('responded','no_response','bounced','unsubscribed','meeting_booked')),
  ADD COLUMN IF NOT EXISTS "outcomeDetectedAt" TIMESTAMPTZ;

ALTER TABLE "AgentSettings"
  ADD COLUMN IF NOT EXISTS "confidenceThreshold" INTEGER NOT NULL DEFAULT 0 CHECK ("confidenceThreshold" >= 0 AND "confidenceThreshold" <= 100);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW."updatedAt" = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AgentGoal_updatedAt" ON "AgentGoal";
CREATE TRIGGER "AgentGoal_updatedAt"
  BEFORE UPDATE ON "AgentGoal"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 15. TelemetryEvent (20260518000000) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TelemetryEvent" (
  id          TEXT        PRIMARY KEY,
  "spaceId"   TEXT,
  "userId"    TEXT,
  event       TEXT        NOT NULL,
  payload     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "TelemetryEvent_event_createdAt_idx"
  ON "TelemetryEvent" (event, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "TelemetryEvent_spaceId_event_idx"
  ON "TelemetryEvent" ("spaceId", event);

-- ── 16. AgentSettings autoseed (20260519000000) ──────────────────────────────
INSERT INTO "AgentSettings" ("spaceId")
SELECT s.id FROM "Space" s
WHERE NOT EXISTS (SELECT 1 FROM "AgentSettings" a WHERE a."spaceId" = s.id);

CREATE OR REPLACE FUNCTION ensure_agent_settings_for_space()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO "AgentSettings" ("spaceId") VALUES (NEW.id)
  ON CONFLICT ("spaceId") DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS space_autoseed_agent_settings ON "Space";
CREATE TRIGGER space_autoseed_agent_settings
  AFTER INSERT ON "Space" FOR EACH ROW
  EXECUTE FUNCTION ensure_agent_settings_for_space();

-- ── 17. Drop dead AgentSettings columns (20260520000000) ─────────────────────
ALTER TABLE "AgentSettings" DROP COLUMN IF EXISTS "autonomyLevel";
ALTER TABLE "AgentSettings" DROP COLUMN IF EXISTS "perAgentAutonomy";
ALTER TABLE "AgentSettings" DROP COLUMN IF EXISTS "confidenceThreshold";
ALTER TABLE "AgentSettings" DROP COLUMN IF EXISTS "enabledAgents";
ALTER TABLE "AgentSettings" DROP COLUMN IF EXISTS "heartbeatIntervalMinutes";

-- ── 18. AgentDraft feedback (20260521000000) ──────────────────────────────────
ALTER TABLE "AgentDraft"
  ADD COLUMN IF NOT EXISTS "feedback_action" TEXT
    CHECK ("feedback_action" IN ('approved','edited_and_approved','rejected','held')),
  ADD COLUMN IF NOT EXISTS "edit_distance"   INTEGER CHECK ("edit_distance" >= 0),
  ADD COLUMN IF NOT EXISTS "decision_ms"     INTEGER CHECK ("decision_ms" >= 0);

CREATE INDEX IF NOT EXISTS "AgentDraft_spaceId_feedback_action_idx"
  ON "AgentDraft" ("spaceId", "feedback_action", "createdAt" DESC)
  WHERE "feedback_action" IS NOT NULL;

-- ── 19. AgentDraft outcome (20260522000000) ───────────────────────────────────
ALTER TABLE "AgentDraft"
  ADD COLUMN IF NOT EXISTS "outcome_signal"     TEXT,
  ADD COLUMN IF NOT EXISTS "outcome_checked_at" TIMESTAMPTZ;

-- ── 20. AgentPausedRun (20260523000000) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AgentPausedRun" (
  "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"        TEXT NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "userId"         TEXT NOT NULL,
  "conversationId" TEXT,
  "runState"       TEXT NOT NULL,
  "approvals"      JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status"         TEXT NOT NULL DEFAULT 'pending'
                     CHECK ("status" IN ('pending','resumed','cancelled','expired')),
  "expiresAt"      TIMESTAMPTZ,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "AgentPausedRun_spaceId_status_idx"
  ON "AgentPausedRun" ("spaceId", "status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AgentPausedRun_userId_idx"
  ON "AgentPausedRun" ("userId");

ALTER TABLE "AgentPausedRun" ENABLE ROW LEVEL SECURITY;

-- ── 21. AgentMemory RPC (20260524000000) ─────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

CREATE OR REPLACE FUNCTION match_agent_memory(
  query_embedding vector(1536),
  match_space_id text,
  match_count int DEFAULT 6,
  filter_memory_type text DEFAULT NULL,
  filter_entity_type text DEFAULT NULL,
  filter_entity_id text DEFAULT NULL,
  min_similarity float DEFAULT 0.0
) RETURNS TABLE (
  id text, content text, "memoryType" text, "entityType" text,
  "entityId" text, importance float, similarity float, "createdAt" timestamptz
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.content, m."memoryType", m."entityType", m."entityId",
    m.importance, (1 - (m.embedding <=> query_embedding))::float AS similarity,
    m."createdAt"
  FROM "AgentMemory" m
  WHERE m."spaceId" = match_space_id AND m.embedding IS NOT NULL
    AND (filter_memory_type IS NULL OR m."memoryType" = filter_memory_type)
    AND (filter_entity_type IS NULL OR m."entityType" = filter_entity_type)
    AND (filter_entity_id   IS NULL OR m."entityId"   = filter_entity_id)
    AND (1 - (m.embedding <=> query_embedding)) >= min_similarity
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END; $$;

-- NOTE: 20260525000000 (IntegrationConnection) already applied — skipped.

-- ── 22. Deal.stageChangedAt (20260526000000) ──────────────────────────────────
ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "stageChangedAt" timestamptz;

UPDATE "Deal" SET "stageChangedAt" = "updatedAt" WHERE "stageChangedAt" IS NULL;

-- ── 23. AgentTask, ExecutionStep, TaskCheckpoint (20260601000000) ─────────────
CREATE TABLE IF NOT EXISTS "AgentTask" (
  "id"               text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"          text        NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "title"            text        NOT NULL,
  "description"      text,
  "status"           text        NOT NULL DEFAULT 'queued'
                       CHECK ("status" IN ('queued','running','paused','completed','failed','cancelled')),
  "triggerSource"    text        NOT NULL DEFAULT 'manual',
  "goalDescription"  text,
  "parentTaskId"     text        REFERENCES "AgentTask"(id) ON DELETE SET NULL,
  "totalSteps"       int         NOT NULL DEFAULT 0,
  "completedSteps"   int         NOT NULL DEFAULT 0,
  "inputTokens"      int         NOT NULL DEFAULT 0,
  "outputTokens"     int         NOT NULL DEFAULT 0,
  "estimatedCostUsd" numeric(10,6) NOT NULL DEFAULT 0,
  "metadata"         jsonb       DEFAULT '{}',
  "startedAt"        timestamptz,
  "completedAt"      timestamptz,
  "cancelledAt"      timestamptz,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "AgentTask_spaceId_status_idx"
  ON "AgentTask" ("spaceId", "status");
CREATE INDEX IF NOT EXISTS "AgentTask_parentTaskId_idx"
  ON "AgentTask" ("parentTaskId") WHERE "parentTaskId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "ExecutionStep" (
  "id"             text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "taskId"         text        NOT NULL REFERENCES "AgentTask"(id) ON DELETE CASCADE,
  "spaceId"        text        NOT NULL,
  "stepIndex"      int         NOT NULL DEFAULT 0,
  "toolName"       text        NOT NULL,
  "toolArgs"       jsonb       DEFAULT '{}',
  "toolResult"     jsonb,
  "status"         text        NOT NULL DEFAULT 'pending'
                     CHECK ("status" IN ('pending','running','completed','failed','skipped')),
  "inputTokens"    int         NOT NULL DEFAULT 0,
  "outputTokens"   int         NOT NULL DEFAULT 0,
  "costUsd"        numeric(10,6) NOT NULL DEFAULT 0,
  "idempotencyKey" text        UNIQUE,
  "errorMessage"   text,
  "startedAt"      timestamptz,
  "completedAt"    timestamptz,
  "createdAt"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ExecutionStep_taskId_stepIndex_idx"
  ON "ExecutionStep" ("taskId", "stepIndex");
CREATE INDEX IF NOT EXISTS "ExecutionStep_idempotencyKey_idx"
  ON "ExecutionStep" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "TaskCheckpoint" (
  "id"             text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "taskId"         text        NOT NULL REFERENCES "AgentTask"(id) ON DELETE CASCADE,
  "spaceId"        text        NOT NULL,
  "checkpointData" jsonb       NOT NULL,
  "stepIndex"      int         NOT NULL DEFAULT 0,
  "createdAt"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "TaskCheckpoint_taskId_idx"
  ON "TaskCheckpoint" ("taskId");

ALTER TABLE "AgentTask"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExecutionStep"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskCheckpoint"  ENABLE ROW LEVEL SECURITY;

-- Policies for AgentTask/ExecutionStep/TaskCheckpoint (idempotent via DROP IF EXISTS)
DROP POLICY IF EXISTS "agent_task: space owner only"      ON "AgentTask";
DROP POLICY IF EXISTS "execution_step: space owner only"  ON "ExecutionStep";
DROP POLICY IF EXISTS "task_checkpoint: space owner only" ON "TaskCheckpoint";

CREATE POLICY "agent_task: space owner only"
  ON "AgentTask" FOR ALL
  USING ("spaceId" IN (SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()));

CREATE POLICY "execution_step: space owner only"
  ON "ExecutionStep" FOR ALL
  USING ("spaceId" IN (SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()));

CREATE POLICY "task_checkpoint: space owner only"
  ON "TaskCheckpoint" FOR ALL
  USING ("spaceId" IN (SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()));

ALTER TABLE "AgentDraft"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" text;

-- Add unique constraint on idempotencyKey if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"AgentDraft"'::regclass
      AND contype = 'u'
      AND conname LIKE '%idempotencyKey%'
  ) THEN
    ALTER TABLE "AgentDraft" ADD UNIQUE ("idempotencyKey");
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ── 24. Artifact + ArtifactVersion (20260601000001) ──────────────────────────
CREATE TABLE IF NOT EXISTS "Artifact" (
  "id"               text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"          text        NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "taskId"           text        REFERENCES "AgentTask"(id) ON DELETE SET NULL,
  "stepId"           text        REFERENCES "ExecutionStep"(id) ON DELETE SET NULL,
  "artifactType"     text        NOT NULL CHECK ("artifactType" IN (
                                   'draft_email','draft_sms','deal_update','contact_update',
                                   'tour_booking','goal_plan','report','raw_output')),
  "title"            text        NOT NULL,
  "contentType"      text        NOT NULL DEFAULT 'text/plain',
  "status"           text        NOT NULL DEFAULT 'draft' CHECK ("status" IN (
                                   'draft','approved','rejected','superseded')),
  "currentVersionId" text,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ArtifactVersion" (
  "id"             text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "artifactId"     text        NOT NULL REFERENCES "Artifact"(id) ON DELETE CASCADE,
  "spaceId"        text        NOT NULL,
  "versionNumber"  int         NOT NULL DEFAULT 1,
  "content"        text        NOT NULL,
  "contentHash"    text        NOT NULL,
  "metadata"       jsonb       DEFAULT '{}',
  "createdByAgent" text        NOT NULL DEFAULT 'chippi',
  "createdAt"      timestamptz NOT NULL DEFAULT now()
);

-- Add FK with DROP IF EXISTS for idempotency
ALTER TABLE "Artifact" DROP CONSTRAINT IF EXISTS "Artifact_currentVersionId_fkey";
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_currentVersionId_fkey"
  FOREIGN KEY ("currentVersionId") REFERENCES "ArtifactVersion"(id)
  ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS "Artifact_spaceId_taskId_idx" ON "Artifact"("spaceId","taskId");
CREATE INDEX IF NOT EXISTS "Artifact_spaceId_status_idx" ON "Artifact"("spaceId","status");
CREATE INDEX IF NOT EXISTS "ArtifactVersion_artifactId_idx" ON "ArtifactVersion"("artifactId");

ALTER TABLE "Artifact"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ArtifactVersion" ENABLE ROW LEVEL SECURITY;

-- ── 25. DeadLetterEvent + DisabledSpace (20260601000002) ─────────────────────
CREATE TABLE IF NOT EXISTS "DeadLetterEvent" (
  "id"            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"       text NOT NULL,
  "eventType"     text NOT NULL,
  "eventPayload"  jsonb NOT NULL DEFAULT '{}',
  "errorMessage"  text NOT NULL,
  "errorStack"    text,
  "attemptCount"  int NOT NULL DEFAULT 1,
  "firstFailedAt" timestamptz NOT NULL DEFAULT now(),
  "lastFailedAt"  timestamptz NOT NULL DEFAULT now(),
  "resolvedAt"    timestamptz,
  "resolvedBy"    text,
  "resolutionNote" text,
  "status"        text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','retrying','resolved','abandoned')),
  "taskId"        text,
  "createdAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "DisabledSpace" (
  "id"          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"     text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "reason"      text NOT NULL,
  "disabledBy"  text NOT NULL DEFAULT 'system',
  "disabledAt"  timestamptz NOT NULL DEFAULT now(),
  "reenabledAt" timestamptz,
  "isActive"    boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS "DisabledSpace_spaceId_active_idx"
  ON "DisabledSpace"("spaceId") WHERE "isActive" = true;
CREATE INDEX IF NOT EXISTS "DeadLetterEvent_spaceId_status_idx" ON "DeadLetterEvent"("spaceId","status");
CREATE INDEX IF NOT EXISTS "DeadLetterEvent_eventType_idx"      ON "DeadLetterEvent"("eventType");
CREATE INDEX IF NOT EXISTS "DisabledSpace_spaceId_isActive_idx" ON "DisabledSpace"("spaceId","isActive");

ALTER TABLE "DeadLetterEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DisabledSpace"   ENABLE ROW LEVEL SECURITY;

-- ── 26. GoalDecomposition + TaskDependency (20260601000003) ───────────────────
CREATE TABLE IF NOT EXISTS "GoalDecomposition" (
  "id"               text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"          text        NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "taskId"           text        REFERENCES "AgentTask"(id) ON DELETE CASCADE,
  "goalText"         text        NOT NULL,
  "decomposedSteps"  jsonb       NOT NULL DEFAULT '[]',
  "llmModel"         text        NOT NULL DEFAULT 'gpt-4.1-mini',
  "promptTokens"     int         NOT NULL DEFAULT 0,
  "completionTokens" int         NOT NULL DEFAULT 0,
  "createdAt"        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TaskDependency" (
  "id"              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "taskId"          text NOT NULL REFERENCES "AgentTask"(id) ON DELETE CASCADE,
  "dependsOnTaskId" text NOT NULL REFERENCES "AgentTask"(id) ON DELETE CASCADE,
  "dependencyType"  text NOT NULL DEFAULT 'sequential'
                       CHECK ("dependencyType" IN ('sequential','data','soft')),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("taskId", "dependsOnTaskId"),
  CHECK ("taskId" <> "dependsOnTaskId")
);

CREATE INDEX IF NOT EXISTS "GoalDecomposition_spaceId_taskId_idx" ON "GoalDecomposition"("spaceId","taskId");
CREATE INDEX IF NOT EXISTS "TaskDependency_taskId_idx"            ON "TaskDependency"("taskId");
CREATE INDEX IF NOT EXISTS "TaskDependency_dependsOnTaskId_idx"   ON "TaskDependency"("dependsOnTaskId");

ALTER TABLE "GoalDecomposition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskDependency"    ENABLE ROW LEVEL SECURITY;

-- ── 27. RLS policies for agent tables (20260601000004) ────────────────────────
-- Enable RLS on older agent tables (idempotent — re-enabling is a no-op)
ALTER TABLE "AgentActivityLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentDraft"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentMemory"      ENABLE ROW LEVEL SECURITY;

-- Drop all policies first for idempotency, then recreate
DROP POLICY IF EXISTS "artifact: space owner only"           ON "Artifact";
DROP POLICY IF EXISTS "artifact_version: space owner only"   ON "ArtifactVersion";
DROP POLICY IF EXISTS "dead_letter_event: space owner only"  ON "DeadLetterEvent";
DROP POLICY IF EXISTS "disabled_space: space owner only"     ON "DisabledSpace";
DROP POLICY IF EXISTS "goal_decomposition: space owner only" ON "GoalDecomposition";
DROP POLICY IF EXISTS "task_dependency: via task space owner" ON "TaskDependency";
DROP POLICY IF EXISTS "agent_activity_log: space owner only" ON "AgentActivityLog";
DROP POLICY IF EXISTS "agent_draft: space owner only"        ON "AgentDraft";
DROP POLICY IF EXISTS "agent_memory: space owner only"       ON "AgentMemory";

CREATE POLICY "artifact: space owner only"
  ON "Artifact" FOR ALL
  USING ("spaceId" IN (SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()));

CREATE POLICY "artifact_version: space owner only"
  ON "ArtifactVersion" FOR ALL
  USING ("spaceId" IN (SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()));

CREATE POLICY "dead_letter_event: space owner only"
  ON "DeadLetterEvent" FOR ALL
  USING ("spaceId" IN (SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()));

CREATE POLICY "disabled_space: space owner only"
  ON "DisabledSpace" FOR ALL
  USING ("spaceId" IN (SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()));

CREATE POLICY "goal_decomposition: space owner only"
  ON "GoalDecomposition" FOR ALL
  USING ("spaceId" IN (SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()));

CREATE POLICY "task_dependency: via task space owner"
  ON "TaskDependency" FOR ALL
  USING (EXISTS (
    SELECT 1 FROM "AgentTask" t WHERE t.id = "TaskDependency"."taskId"
      AND t."spaceId" IN (SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id())
  ));

CREATE POLICY "agent_activity_log: space owner only"
  ON "AgentActivityLog" FOR ALL
  USING ("spaceId" IN (SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()));

CREATE POLICY "agent_draft: space owner only"
  ON "AgentDraft" FOR ALL
  USING ("spaceId" IN (SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()));

CREATE POLICY "agent_memory: space owner only"
  ON "AgentMemory" FOR ALL
  USING ("spaceId" IN (SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()));

-- ── 28. AgentMemory.taskId (20260601000005) ───────────────────────────────────
ALTER TABLE "AgentMemory"
  ADD COLUMN IF NOT EXISTS "taskId" TEXT REFERENCES "AgentTask"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "AgentMemory_taskId_idx"
  ON "AgentMemory"("taskId") WHERE "taskId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "AgentMemory_spaceId_taskId_idx"
  ON "AgentMemory"("spaceId","taskId") WHERE "taskId" IS NOT NULL;

-- ── 29. Data retention function (20260601000006) ──────────────────────────────
CREATE OR REPLACE FUNCTION cleanup_agent_data()
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  deleted_steps int; deleted_tasks int; deleted_memories int;
  deleted_versions int; deleted_artifacts int;
BEGIN
  DELETE FROM "ExecutionStep" WHERE id IN (
    SELECT id FROM "ExecutionStep"
    WHERE COALESCE("startedAt","createdAt") < NOW() - INTERVAL '30 days' LIMIT 1000);
  GET DIAGNOSTICS deleted_steps = ROW_COUNT;

  DELETE FROM "AgentTask" WHERE id IN (
    SELECT id FROM "AgentTask"
    WHERE status IN ('completed','failed','cancelled')
      AND "createdAt" < NOW() - INTERVAL '90 days' LIMIT 1000);
  GET DIAGNOSTICS deleted_tasks = ROW_COUNT;

  DELETE FROM "AgentMemory" WHERE id IN (
    SELECT id FROM "AgentMemory"
    WHERE "expiresAt" IS NOT NULL AND "expiresAt" < NOW() LIMIT 1000);
  GET DIAGNOSTICS deleted_memories = ROW_COUNT;

  DELETE FROM "ArtifactVersion" WHERE id IN (
    SELECT av.id FROM "ArtifactVersion" av
    JOIN "Artifact" a ON av."artifactId" = a.id
    JOIN "AgentTask" at ON a."taskId" = at.id
    WHERE at."createdAt" < NOW() - INTERVAL '90 days' LIMIT 1000);
  GET DIAGNOSTICS deleted_versions = ROW_COUNT;

  DELETE FROM "Artifact" WHERE id IN (
    SELECT a.id FROM "Artifact" a
    JOIN "AgentTask" at ON a."taskId" = at.id
    WHERE at."createdAt" < NOW() - INTERVAL '90 days' LIMIT 1000);
  GET DIAGNOSTICS deleted_artifacts = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_steps', deleted_steps, 'deleted_tasks', deleted_tasks,
    'deleted_memories', deleted_memories,
    'deleted_artifact_versions', deleted_versions,
    'deleted_artifacts', deleted_artifacts, 'ran_at', NOW());
END; $$;

-- ── 30. Memory source attribution (20260601000007) ────────────────────────────
ALTER TABLE "AgentMemory"
  ADD COLUMN IF NOT EXISTS "sourceRunId"            TEXT,
  ADD COLUMN IF NOT EXISTS "sourceToolName"         TEXT,
  ADD COLUMN IF NOT EXISTS "sourceConversationId"   TEXT;

CREATE INDEX IF NOT EXISTS "AgentMemory_sourceRunId_idx"
  ON "AgentMemory"("sourceRunId") WHERE "sourceRunId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "AgentMemory_sourceToolName_idx"
  ON "AgentMemory"("sourceToolName") WHERE "sourceToolName" IS NOT NULL;

-- ── 31. ExecutionStep display columns (20260602000001) ────────────────────────
ALTER TABLE "ExecutionStep"
  ADD COLUMN IF NOT EXISTS "stepType"     text NOT NULL DEFAULT 'tool_call',
  ADD COLUMN IF NOT EXISTS "inputSummary" text,
  ADD COLUMN IF NOT EXISTS "outputSummary" text;

ALTER TABLE "ExecutionStep"
  ALTER COLUMN "stepIndex" SET DEFAULT 0;

-- ============================================================================
-- Done. All migrations applied idempotently.
-- ============================================================================
