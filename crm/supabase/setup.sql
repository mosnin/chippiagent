-- ============================================================================
-- Complete database setup — run this once in Supabase SQL Editor
-- Dashboard → SQL Editor → New query → paste everything → Run
-- ============================================================================
-- This is the single source of truth. It is idempotent: safe to re-run.
-- ============================================================================

-- ── Extensions ──────────────────────────────────────────────────────────────
-- pgvector is required for the AI similarity-search feature.
-- Enable it first: Dashboard → Database → Extensions → search "vector" → enable
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Tables (in FK-dependency order) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "User" (
  id                      text        PRIMARY KEY,
  "clerkId"               text        UNIQUE NOT NULL,
  email                   text        NOT NULL,
  name                    text,
  avatar                  text,
  bio                     text,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "onboardingCurrentStep" integer     NOT NULL DEFAULT 0,
  "onboardingStartedAt"   timestamptz,
  "onboardingCompletedAt" timestamptz,
  onboard                 boolean     NOT NULL DEFAULT false,
  "platformRole"          text        NOT NULL DEFAULT 'user'
                            CHECK ("platformRole" IN ('user', 'admin'))
);

-- Brokerage must exist before Space (Space.brokerageId → Brokerage)
CREATE TABLE IF NOT EXISTS "Brokerage" (
  id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name         text        NOT NULL,
  "ownerId"    text        NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  status       text        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'suspended')),
  "websiteUrl" text,
  "logoUrl"    text,
  "joinCode"   text        UNIQUE,
  "createdAt"  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Space" (
  id            text        PRIMARY KEY,
  slug          text        UNIQUE NOT NULL,
  name          text        NOT NULL,
  emoji         text        NOT NULL DEFAULT '🏠',
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "ownerId"     text        UNIQUE NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "brokerageId" text        REFERENCES "Brokerage"(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "SpaceSetting" (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"           text UNIQUE NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  notifications       boolean     NOT NULL DEFAULT true,
  timezone            text        NOT NULL DEFAULT 'America/New_York',
  "phoneNumber"       text,
  "myConnections"     text,
  "aiPersonalization" text,
  "billingSettings"   text,
  "anthropicApiKey"   text,
  "businessName"      text,
  "intakePageTitle"   text,
  "intakePageIntro"   text
);

CREATE TABLE IF NOT EXISTS "Contact" (
  id                text        PRIMARY KEY,
  "spaceId"         text        NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  email             text,
  phone             text,
  address           text,
  notes             text,
  budget            double precision,
  preferences       text,
  properties        text[]      NOT NULL DEFAULT '{}',
  type              text        NOT NULL DEFAULT 'QUALIFICATION',
  tags              text[]      NOT NULL DEFAULT '{}',
  "leadScore"       double precision,
  "scoreLabel"      text,
  "scoreSummary"    text,
  "scoringStatus"   text        NOT NULL DEFAULT 'pending',
  "scoreDetails"    jsonb,
  "applicationData" jsonb,
  "followUpAt"      timestamptz,
  "lastContactedAt" timestamptz,
  "sourceLabel"     text,
  "stageChangedAt"  timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ContactActivity" (
  id          text        PRIMARY KEY,
  "contactId" text        NOT NULL REFERENCES "Contact"(id) ON DELETE CASCADE,
  "spaceId"   text        NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  type        text        NOT NULL
                CHECK (type IN ('note', 'call', 'email', 'meeting', 'follow_up')),
  content     text,
  metadata    jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "DealStage" (
  id        text    PRIMARY KEY,
  "spaceId" text    NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  name      text    NOT NULL,
  color     text    NOT NULL DEFAULT '#6B7280',
  position  integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "Deal" (
  id          text             PRIMARY KEY,
  "spaceId"   text             NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  title       text             NOT NULL,
  description text,
  value       double precision,
  address     text,
  priority    text             NOT NULL DEFAULT 'MEDIUM',
  "closeDate"  timestamptz,
  "stageId"    text             NOT NULL REFERENCES "DealStage"(id) ON DELETE CASCADE,
  position     integer          NOT NULL DEFAULT 0,
  status       text             NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active', 'won', 'lost', 'on_hold')),
  "followUpAt" timestamptz,
  "createdAt"  timestamptz      NOT NULL DEFAULT now(),
  "updatedAt"  timestamptz      NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "DealContact" (
  "dealId"    text NOT NULL REFERENCES "Deal"(id) ON DELETE CASCADE,
  "contactId" text NOT NULL REFERENCES "Contact"(id) ON DELETE CASCADE,
  PRIMARY KEY ("dealId", "contactId")
);

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

CREATE TABLE IF NOT EXISTS "Message" (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"   text        NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  role        text        NOT NULL,
  content     text        NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "BrokerageMembership" (
  id            text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "brokerageId" text        NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE,
  "userId"      text        NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  role          text        NOT NULL
                  CHECK (role IN ('broker_owner', 'broker_admin', 'realtor_member')),
  "invitedById" text        REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("brokerageId", "userId")
);

CREATE TABLE IF NOT EXISTS "Invitation" (
  id             text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "brokerageId"  text        NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE,
  email          text        NOT NULL,
  "roleToAssign" text        NOT NULL
                   CHECK ("roleToAssign" IN ('broker_admin', 'realtor_member')),
  token          text        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status         text        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  "expiresAt"    timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  "invitedById"  text        REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt"    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "actorId"    text,
  "clerkId"    text,
  "ipAddress"  text,
  action       text        NOT NULL,
  resource     text        NOT NULL,
  "resourceId" text,
  "spaceId"    text,
  metadata     jsonb,
  "createdAt"  timestamptz NOT NULL DEFAULT now()
);

-- Requires the vector extension enabled above
CREATE TABLE IF NOT EXISTS "DocumentEmbedding" (
  id           text    PRIMARY KEY,
  "spaceId"    text    NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "entityType" text    NOT NULL,  -- 'contact' | 'deal'
  "entityId"   text    NOT NULL,
  content      text    NOT NULL,
  embedding    vector(1536)       -- OpenAI text-embedding-3-small
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_clerk_id        ON "User"("clerkId");
CREATE INDEX IF NOT EXISTS idx_space_owner_id        ON "Space"("ownerId");
CREATE INDEX IF NOT EXISTS idx_space_slug            ON "Space"(slug);
CREATE INDEX IF NOT EXISTS idx_space_brokerage       ON "Space"("brokerageId");
CREATE INDEX IF NOT EXISTS idx_space_setting_sid     ON "SpaceSetting"("spaceId");

CREATE INDEX IF NOT EXISTS idx_contact_space_id      ON "Contact"("spaceId");
CREATE INDEX IF NOT EXISTS idx_contact_tags          ON "Contact" USING gin(tags);
CREATE INDEX IF NOT EXISTS contact_space_created_idx ON "Contact"("spaceId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS contact_scoring_status_idx ON "Contact"("spaceId", "scoringStatus");

CREATE INDEX IF NOT EXISTS idx_contact_activity_contact ON "ContactActivity"("contactId");
CREATE INDEX IF NOT EXISTS idx_contact_activity_space   ON "ContactActivity"("spaceId");
CREATE INDEX IF NOT EXISTS idx_contact_activity_type    ON "ContactActivity"(type);

CREATE INDEX IF NOT EXISTS idx_deal_space_id         ON "Deal"("spaceId");
CREATE INDEX IF NOT EXISTS idx_deal_stage_id         ON "Deal"("stageId");
CREATE INDEX IF NOT EXISTS deal_space_position_idx   ON "Deal"("spaceId", "position");
CREATE INDEX IF NOT EXISTS deal_stage_position_idx   ON "Deal"("stageId", "position");
CREATE INDEX IF NOT EXISTS idx_dealstage_space_id    ON "DealStage"("spaceId");
CREATE INDEX IF NOT EXISTS idx_dealcontact_deal      ON "DealContact"("dealId");
CREATE INDEX IF NOT EXISTS idx_dealcontact_contact   ON "DealContact"("contactId");
CREATE INDEX IF NOT EXISTS deal_contact_contact_idx  ON "DealContact"("contactId");

CREATE INDEX IF NOT EXISTS idx_deal_activity_deal    ON "DealActivity"("dealId");
CREATE INDEX IF NOT EXISTS idx_deal_activity_space   ON "DealActivity"("spaceId");
CREATE INDEX IF NOT EXISTS idx_deal_activity_type    ON "DealActivity"(type);

CREATE INDEX IF NOT EXISTS contact_follow_up_idx     ON "Contact"("spaceId", "followUpAt" DESC);
CREATE INDEX IF NOT EXISTS deal_follow_up_idx        ON "Deal"("spaceId", "followUpAt" DESC);
CREATE INDEX IF NOT EXISTS deal_status_idx           ON "Deal"("spaceId", status);

CREATE INDEX IF NOT EXISTS idx_message_space_id      ON "Message"("spaceId");
CREATE INDEX IF NOT EXISTS message_space_created_idx ON "Message"("spaceId", "createdAt" ASC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brokerage_owner     ON "Brokerage"("ownerId");
CREATE INDEX       IF NOT EXISTS idx_brokerage_status     ON "Brokerage"(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_brokerage_join_code ON "Brokerage"("joinCode");

CREATE INDEX IF NOT EXISTS idx_membership_brokerage ON "BrokerageMembership"("brokerageId");
CREATE INDEX IF NOT EXISTS idx_membership_user      ON "BrokerageMembership"("userId");

CREATE INDEX IF NOT EXISTS idx_invitation_brokerage ON "Invitation"("brokerageId");
CREATE INDEX IF NOT EXISTS idx_invitation_email     ON "Invitation"(email);
CREATE INDEX IF NOT EXISTS idx_invitation_token     ON "Invitation"(token);
CREATE INDEX IF NOT EXISTS idx_invitation_status    ON "Invitation"(status);

CREATE INDEX IF NOT EXISTS idx_audit_clerk_id       ON "AuditLog"("clerkId");
CREATE INDEX IF NOT EXISTS idx_audit_resource       ON "AuditLog"(resource, "resourceId");
CREATE INDEX IF NOT EXISTS idx_audit_space_id       ON "AuditLog"("spaceId");
CREATE INDEX IF NOT EXISTS idx_audit_created_at     ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS audit_actor_created_idx  ON "AuditLog"("clerkId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS audit_resource_created_idx ON "AuditLog"("resource", "resourceId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_doc_embedding_space  ON "DocumentEmbedding"("spaceId");
CREATE INDEX IF NOT EXISTS idx_doc_embedding_entity ON "DocumentEmbedding"("entityId");
CREATE INDEX IF NOT EXISTS embedding_entity_idx     ON "DocumentEmbedding"("entityType", "entityId");
-- HNSW index for fast approximate nearest-neighbour search
CREATE INDEX IF NOT EXISTS idx_doc_embedding_hnsw
  ON "DocumentEmbedding" USING hnsw (embedding vector_cosine_ops);

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- The app uses the service_role key which bypasses RLS.
-- RLS blocks accidental exposure of the anon/authenticated keys.

ALTER TABLE "User"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Brokerage"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Space"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaceSetting"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contact"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContactActivity"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealStage"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Deal"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealContact"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealActivity"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrokerageMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentEmbedding"   ENABLE ROW LEVEL SECURITY;

-- No permissive policies = DENY ALL for anon/authenticated roles.
-- Service role bypasses these restrictions entirely.

-- ── Functions ────────────────────────────────────────────────────────────────

-- reorder_deal: atomically move a deal to a new stage/position (Kanban DnD)
CREATE OR REPLACE FUNCTION reorder_deal(
  p_deal_id      text,
  p_new_stage_id text,
  p_new_position integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "Deal"
  SET position = position + 1
  WHERE "stageId" = p_new_stage_id
    AND position >= p_new_position
    AND id != p_deal_id;

  UPDATE "Deal"
  SET "stageId"   = p_new_stage_id,
      position    = p_new_position,
      "updatedAt" = now()
  WHERE id = p_deal_id;
END;
$$;

-- match_documents: cosine-similarity search for the AI assistant
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_space_id  text,
  match_count     int DEFAULT 5
)
RETURNS TABLE (
  id          text,
  entity_type text,
  entity_id   text,
  content     text,
  similarity  float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.id,
    de."entityType"  AS entity_type,
    de."entityId"    AS entity_id,
    de.content,
    1 - (de.embedding <=> query_embedding) AS similarity
  FROM "DocumentEmbedding" de
  WHERE de."spaceId" = match_space_id
    AND de.embedding IS NOT NULL
  ORDER BY de.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
