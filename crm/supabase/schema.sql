-- Supabase schema for Real Estate CRM
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ============================================================
-- Extensions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- Tables (in dependency order)
-- ============================================================

CREATE TABLE IF NOT EXISTS "User" (
  id              text PRIMARY KEY,
  "clerkId"       text UNIQUE NOT NULL,
  email           text NOT NULL,
  name            text,
  avatar          text,
  bio             text,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "onboardingCurrentStep" integer NOT NULL DEFAULT 0,
  "onboardingStartedAt"   timestamptz,
  "onboardingCompletedAt" timestamptz,
  onboard                 boolean NOT NULL DEFAULT false,
  "platformRole"          text NOT NULL DEFAULT 'user' CHECK ("platformRole" IN ('user', 'admin', 'banned')),
  "accountType"           text NOT NULL DEFAULT 'realtor' CHECK ("accountType" IN ('realtor', 'broker_only', 'both'))
);

CREATE TABLE IF NOT EXISTS "Brokerage" (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name          text NOT NULL,
  "ownerId"     text NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  "websiteUrl"  text,
  "logoUrl"     text,
  "joinCode"    text UNIQUE,
  "brokerageFormConfig" jsonb DEFAULT NULL,
  "brokerageRentalFormConfig" jsonb DEFAULT NULL,
  "brokerageBuyerFormConfig" jsonb DEFAULT NULL,
  "brokerageRentalScoringModel" jsonb DEFAULT NULL,
  "brokerageBuyerScoringModel" jsonb DEFAULT NULL,
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Space" (
  id            text PRIMARY KEY,
  slug          text UNIQUE NOT NULL,
  name          text NOT NULL,
  emoji         text NOT NULL DEFAULT '🏠',
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "ownerId"     text UNIQUE NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "brokerageId" text REFERENCES "Brokerage"(id) ON DELETE SET NULL,
  "stripeCustomerId"          text,
  "stripeSubscriptionId"      text,
  "stripeSubscriptionStatus"  text NOT NULL DEFAULT 'inactive'
    CHECK ("stripeSubscriptionStatus" IN (
      'active', 'trialing', 'past_due', 'canceled', 'unpaid', 'inactive'
    )),
  "stripePeriodEnd"           timestamptz,
  "trialUsedAt"               timestamptz
);

CREATE TABLE IF NOT EXISTS "SpaceSetting" (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"           text UNIQUE NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  notifications       boolean NOT NULL DEFAULT true,
  "smsNotifications"  boolean NOT NULL DEFAULT false,
  "notifyNewLeads"    boolean NOT NULL DEFAULT true,
  "notifyTourBookings" boolean NOT NULL DEFAULT true,
  "notifyNewDeals"    boolean NOT NULL DEFAULT true,
  "notifyFollowUps"   boolean NOT NULL DEFAULT true,
  timezone            text NOT NULL DEFAULT 'America/New_York',
  "phoneNumber"       text,
  "myConnections"     text,
  "aiPersonalization" text,
  "billingSettings"   text,
  "anthropicApiKey"   text,
  "businessName"      text,
  "intakePageTitle"   text,
  "intakePageIntro"   text,
  bio                 text,
  "socialLinks"       jsonb DEFAULT '{}',
  "intakeAccentColor" text DEFAULT '#ff964f',
  "intakeBorderRadius" text DEFAULT 'rounded'
    CHECK ("intakeBorderRadius" IN ('rounded', 'sharp')),
  "intakeFont"        text DEFAULT 'system'
    CHECK ("intakeFont" IN ('system', 'serif', 'mono')),
  "intakeFooterLinks" jsonb DEFAULT '[]',
  "tourDuration"         integer NOT NULL DEFAULT 30,
  "tourStartHour"        integer NOT NULL DEFAULT 9,
  "tourEndHour"          integer NOT NULL DEFAULT 17,
  "tourDaysAvailable"    integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  "tourBookingPageTitle" text,
  "tourBookingPageIntro" text,
  "tourBufferMinutes"    integer NOT NULL DEFAULT 0,
  "tourBlockedDates"     text[] NOT NULL DEFAULT '{}',
  "privacyPolicyUrl"     text,
  "consentCheckboxLabel" text,
  "formConfig"           jsonb DEFAULT NULL,
  "rentalFormConfig"     jsonb DEFAULT NULL,
  "buyerFormConfig"      jsonb DEFAULT NULL,
  "formConfigSource"     text NOT NULL DEFAULT 'legacy'
    CHECK ("formConfigSource" IN ('custom', 'brokerage', 'legacy')),
  "rentalScoringModel"   jsonb DEFAULT NULL,
  "buyerScoringModel"    jsonb DEFAULT NULL,
  "trackingPixels"       jsonb
);

CREATE TABLE IF NOT EXISTS "Contact" (
  id              text PRIMARY KEY,
  "spaceId"       text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  name            text NOT NULL,
  email           text,
  phone           text,
  "leadType"      text NOT NULL DEFAULT 'rental' CHECK ("leadType" IN ('rental', 'buyer')),
  address         text,
  notes           text,
  budget          double precision,
  preferences     text,
  properties      text[] NOT NULL DEFAULT '{}',
  type            text NOT NULL DEFAULT 'QUALIFICATION',
  tags            text[] NOT NULL DEFAULT '{}',
  "leadScore"     double precision,
  "scoreLabel"    text,
  "scoreSummary"  text,
  "scoringStatus" text NOT NULL DEFAULT 'pending',
  "scoreDetails"  jsonb,
  "applicationData"       jsonb,
  "followUpAt"            timestamptz,
  "lastContactedAt"       timestamptz,
  "sourceLabel"           text,
  "brokerageId"           text REFERENCES "Brokerage"(id) ON DELETE SET NULL,
  "stageChangedAt"        timestamptz,
  "applicationRef"        text,
  "applicationStatus"     text,
  "applicationStatusNote" text,
  "statusPortalToken"     text UNIQUE,
  "consentGiven"          boolean,
  "consentTimestamp"      timestamptz,
  "consentIp"             text,
  "consentPrivacyPolicyUrl" text,
  "formConfigSnapshot"      jsonb DEFAULT NULL,
  "formLeadType"            text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "DealStage" (
  id          text PRIMARY KEY,
  "spaceId"   text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#6B7280',
  position    integer NOT NULL DEFAULT 0
);

-- TourPropertyProfile must be defined before Tour (Tour.propertyProfileId FK)
CREATE TABLE IF NOT EXISTS "TourPropertyProfile" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"       text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  name            text NOT NULL,
  address         text,
  "tourDuration"  integer NOT NULL DEFAULT 30,
  "startHour"     integer NOT NULL DEFAULT 9,
  "endHour"       integer NOT NULL DEFAULT 17,
  "daysAvailable" integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  "bufferMinutes" integer NOT NULL DEFAULT 0,
  "isActive"      boolean NOT NULL DEFAULT true,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

-- Tour must be defined before Deal (Deal.sourceTourId FK)
CREATE TABLE IF NOT EXISTS "Tour" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"       text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "contactId"     text REFERENCES "Contact"(id) ON DELETE SET NULL,
  "propertyProfileId" text REFERENCES "TourPropertyProfile"(id) ON DELETE SET NULL,
  "guestName"     text NOT NULL,
  "guestEmail"    text NOT NULL,
  "guestPhone"    text,
  "propertyAddress" text,
  notes           text,
  "startsAt"      timestamptz NOT NULL,
  "endsAt"        timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  "googleEventId" text,
  "manageToken"   text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Deal" (
  id          text PRIMARY KEY,
  "spaceId"   text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  value       double precision,
  address     text,
  priority    text NOT NULL DEFAULT 'MEDIUM',
  "closeDate" timestamptz,
  "stageId"   text NOT NULL REFERENCES "DealStage"(id) ON DELETE CASCADE,
  position    integer NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'won', 'lost', 'on_hold')),
  "followUpAt" timestamptz,
  "sourceTourId" text REFERENCES "Tour"(id) ON DELETE SET NULL,
  "commissionRate" NUMERIC(5,2) DEFAULT NULL,
  "probability"    INTEGER DEFAULT NULL CHECK ("probability" >= 0 AND "probability" <= 100),
  "milestones"     JSONB DEFAULT '[]'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "DealContact" (
  "dealId"    text NOT NULL REFERENCES "Deal"(id) ON DELETE CASCADE,
  "contactId" text NOT NULL REFERENCES "Contact"(id) ON DELETE CASCADE,
  PRIMARY KEY ("dealId", "contactId")
);

CREATE TABLE IF NOT EXISTS "Conversation" (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"   text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT 'New conversation',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Message" (
  id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"        text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "conversationId" text REFERENCES "Conversation"(id) ON DELETE CASCADE,
  role             text NOT NULL,
  content          text NOT NULL,
  "createdAt"      timestamptz NOT NULL DEFAULT now()
);

-- Chat attachments: files the realtor uploads via the prompt box.
-- Owned by spaceId; the cowork agent reads them via the read_attachment tool.
CREATE TABLE IF NOT EXISTS "Attachment" (
  id              text PRIMARY KEY,
  "spaceId"       text NOT NULL,
  "userId"        text,
  "conversationId" text,
  filename        text NOT NULL,
  "mimeType"      text NOT NULL,
  "sizeBytes"     int NOT NULL,
  "storagePath"   text NOT NULL,
  "publicUrl"     text NOT NULL,
  "extractedText" text,
  "extractionStatus" text NOT NULL DEFAULT 'pending'
    CHECK ("extractionStatus" IN ('pending','skipped','done','failed')),
  "createdAt"     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Attachment_spaceId_createdAt_idx"
  ON "Attachment" ("spaceId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Attachment_conversationId_idx"
  ON "Attachment" ("conversationId")
  WHERE "conversationId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "BrokerageMembership" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "brokerageId"   text NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE,
  "userId"        text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('broker_owner', 'broker_admin', 'realtor_member')),
  "invitedById"   text REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("brokerageId", "userId")
);

CREATE TABLE IF NOT EXISTS "Invitation" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "brokerageId"   text NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE,
  email           text NOT NULL,
  "roleToAssign"  text NOT NULL CHECK ("roleToAssign" IN ('broker_admin', 'realtor_member')),
  token           text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  "expiresAt"     timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  "invitedById"   text REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "GoogleCalendarToken" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"       text UNIQUE NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "accessToken"   text NOT NULL,
  "refreshToken"  text NOT NULL,
  "expiresAt"     timestamptz NOT NULL,
  "calendarId"    text NOT NULL DEFAULT 'primary',
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "BrokerNotification" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "brokerageId"   text NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE,
  type            text NOT NULL,
  title           text NOT NULL,
  body            text,
  metadata        jsonb,
  read            boolean NOT NULL DEFAULT false,
  "createdAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "clerkId"     text,
  "ipAddress"   text,
  action        text NOT NULL,
  resource      text NOT NULL,
  "resourceId"  text,
  "spaceId"     text,
  metadata      jsonb,
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TourAvailabilityOverride" (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"           text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "propertyProfileId" text REFERENCES "TourPropertyProfile"(id) ON DELETE CASCADE,
  date                date NOT NULL,
  "isBlocked"         boolean NOT NULL DEFAULT false,
  "startHour"         integer,
  "endHour"           integer,
  label               text,
  recurrence          text NOT NULL DEFAULT 'none'
                        CHECK (recurrence IN ('none', 'weekly', 'biweekly', 'monthly')),
  "endDate"           date,
  "createdAt"         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TourWaitlist" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"       text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "propertyProfileId" text REFERENCES "TourPropertyProfile"(id) ON DELETE SET NULL,
  "guestName"     text NOT NULL,
  "guestEmail"    text NOT NULL,
  "guestPhone"    text,
  "preferredDate" date NOT NULL,
  notes           text,
  status          text NOT NULL DEFAULT 'waiting'
                    CHECK (status IN ('waiting', 'notified', 'booked', 'expired')),
  "notifiedAt"    timestamptz,
  "expiresAt"     timestamptz,
  "createdAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "DocumentEmbedding" (
  id            text PRIMARY KEY,
  "spaceId"     text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "entityType"  text NOT NULL,   -- 'contact' | 'deal'
  "entityId"    text NOT NULL,
  content       text NOT NULL,   -- plain text used to generate the embedding
  embedding     vector(1536)     -- OpenAI text-embedding-3-small output
);

CREATE TABLE IF NOT EXISTS "FormAnalyticsEvent" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "spaceId"           text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "sessionId"         text NOT NULL,
  "formConfigVersion" integer,
  "eventType"         text NOT NULL
    CHECK ("eventType" IN ('form_start', 'step_view', 'step_complete', 'form_submit', 'form_abandon')),
  "stepIndex"         integer,
  "stepTitle"         text,
  "durationMs"        integer,
  metadata            jsonb,
  "createdAt"         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "FormDraft" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "spaceId"           text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  email               text NOT NULL,
  "resumeToken"       text NOT NULL UNIQUE,
  answers             jsonb NOT NULL DEFAULT '{}',
  "currentStep"       integer NOT NULL DEFAULT 0,
  "formConfigVersion" integer,
  "expiresAt"         timestamptz NOT NULL,
  "completedAt"       timestamptz,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ApplicationMessage" (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contactId" text NOT NULL REFERENCES "Contact"(id) ON DELETE CASCADE,
  "spaceId"   text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "senderType" text NOT NULL CHECK ("senderType" IN ('applicant', 'realtor')),
  content     text NOT NULL CHECK (char_length(content) <= 2000),
  "readAt"    timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ApplicationStatusUpdate" (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contactId" text NOT NULL REFERENCES "Contact"(id) ON DELETE CASCADE,
  "spaceId"   text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "fromStatus" text,
  "toStatus"  text NOT NULL,
  note        text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Migrations: ADD COLUMN IF NOT EXISTS for existing databases
-- Runs before indexes so columns exist when indexes are created.
-- Safe to run on both fresh and existing databases.
-- ============================================================

ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "conversationId" text REFERENCES "Conversation"(id) ON DELETE CASCADE;

ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "applicationData"       jsonb;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "followUpAt"            timestamptz;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "lastContactedAt"       timestamptz;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "sourceLabel"           text;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "stageChangedAt"        timestamptz;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "applicationRef"        text;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "applicationStatus"     text;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "applicationStatusNote" text;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "statusPortalToken"     text UNIQUE;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "consentGiven"          boolean;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "consentTimestamp"      timestamptz;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "consentIp"             text;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "consentPrivacyPolicyUrl" text;

ALTER TABLE "Tour" ADD COLUMN IF NOT EXISTS "manageToken"       text;
ALTER TABLE "Tour" ADD COLUMN IF NOT EXISTS "propertyProfileId" text REFERENCES "TourPropertyProfile"(id) ON DELETE SET NULL;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountType" text NOT NULL DEFAULT 'realtor' CHECK ("accountType" IN ('realtor', 'broker_only', 'both'));

ALTER TABLE "Space" ADD COLUMN IF NOT EXISTS "brokerageId" text REFERENCES "Brokerage"(id) ON DELETE SET NULL;

ALTER TABLE "Brokerage" ADD COLUMN IF NOT EXISTS "joinCode"   text UNIQUE;
ALTER TABLE "Brokerage" ADD COLUMN IF NOT EXISTS "logoUrl"    text;
ALTER TABLE "Brokerage" ADD COLUMN IF NOT EXISTS "websiteUrl" text;

ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "tourDuration"         integer NOT NULL DEFAULT 30;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "tourStartHour"        integer NOT NULL DEFAULT 9;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "tourEndHour"          integer NOT NULL DEFAULT 17;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "tourDaysAvailable"    integer[] NOT NULL DEFAULT '{1,2,3,4,5}';
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "tourBookingPageTitle" text;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "tourBookingPageIntro" text;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "tourBufferMinutes"    integer NOT NULL DEFAULT 0;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "tourBlockedDates"     text[] NOT NULL DEFAULT '{}';
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "anthropicApiKey"      text;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "businessName"         text;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "intakePageTitle"      text;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "intakePageIntro"      text;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "smsNotifications"    boolean NOT NULL DEFAULT false;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "notifyNewLeads"     boolean NOT NULL DEFAULT true;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "notifyTourBookings" boolean NOT NULL DEFAULT true;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "notifyNewDeals"     boolean NOT NULL DEFAULT true;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "notifyFollowUps"    boolean NOT NULL DEFAULT true;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "privacyPolicyHtml"  text;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "privacyPolicyUrl"  text;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "consentCheckboxLabel" text;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "formConfig"           jsonb DEFAULT NULL;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "rentalFormConfig"     jsonb DEFAULT NULL;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "buyerFormConfig"      jsonb DEFAULT NULL;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "formConfigSource"     text NOT NULL DEFAULT 'legacy';
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "trackingPixels"       jsonb;

ALTER TABLE "Brokerage" ADD COLUMN IF NOT EXISTS "privacyPolicyHtml"    text;
ALTER TABLE "Brokerage" ADD COLUMN IF NOT EXISTS "brokerageFormConfig"  jsonb DEFAULT NULL;
ALTER TABLE "Brokerage" ADD COLUMN IF NOT EXISTS "brokerageRentalFormConfig" jsonb DEFAULT NULL;
ALTER TABLE "Brokerage" ADD COLUMN IF NOT EXISTS "brokerageBuyerFormConfig"  jsonb DEFAULT NULL;

ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "formConfigSnapshot"    jsonb DEFAULT NULL;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "formLeadType"         text;

ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "commissionRate" NUMERIC(5,2) DEFAULT NULL;
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "probability" INTEGER DEFAULT NULL CHECK ("probability" >= 0 AND "probability" <= 100);
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "milestones" JSONB DEFAULT '[]'::jsonb;

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_user_clerk_id       ON "User"("clerkId");
CREATE INDEX IF NOT EXISTS idx_space_owner_id      ON "Space"("ownerId");
CREATE INDEX IF NOT EXISTS idx_space_slug          ON "Space"(slug);
CREATE INDEX IF NOT EXISTS idx_space_brokerage     ON "Space"("brokerageId");
CREATE INDEX IF NOT EXISTS idx_space_setting_sid   ON "SpaceSetting"("spaceId");
CREATE INDEX IF NOT EXISTS idx_space_setting_form_config_source
  ON "SpaceSetting"("formConfigSource");
CREATE INDEX IF NOT EXISTS idx_space_setting_form_config
  ON "SpaceSetting" USING gin("formConfig") WHERE "formConfig" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_brokerage_form_config
  ON "Brokerage" USING gin("brokerageFormConfig") WHERE "brokerageFormConfig" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_space_setting_rental_form_config
  ON "SpaceSetting" USING gin("rentalFormConfig") WHERE "rentalFormConfig" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_space_setting_buyer_form_config
  ON "SpaceSetting" USING gin("buyerFormConfig") WHERE "buyerFormConfig" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_brokerage_rental_form_config
  ON "Brokerage" USING gin("brokerageRentalFormConfig") WHERE "brokerageRentalFormConfig" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_brokerage_buyer_form_config
  ON "Brokerage" USING gin("brokerageBuyerFormConfig") WHERE "brokerageBuyerFormConfig" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contact_space_id    ON "Contact"("spaceId");
CREATE INDEX IF NOT EXISTS idx_contact_tags        ON "Contact" USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_contact_email       ON "Contact"(email);
CREATE INDEX IF NOT EXISTS idx_contact_phone       ON "Contact"(phone);
CREATE INDEX IF NOT EXISTS idx_contact_status_portal_token
  ON "Contact"("statusPortalToken") WHERE "statusPortalToken" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_application_ref
  ON "Contact"("applicationRef") WHERE "applicationRef" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_app_message_contact
  ON "ApplicationMessage"("contactId", "createdAt" ASC);
CREATE INDEX IF NOT EXISTS idx_app_message_space
  ON "ApplicationMessage"("spaceId");
CREATE INDEX IF NOT EXISTS idx_app_message_unread
  ON "ApplicationMessage"("contactId", "readAt") WHERE "readAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_app_status_update_contact
  ON "ApplicationStatusUpdate"("contactId", "createdAt" ASC);
CREATE INDEX IF NOT EXISTS idx_app_status_update_space
  ON "ApplicationStatusUpdate"("spaceId");

CREATE INDEX IF NOT EXISTS idx_dealstage_space_id  ON "DealStage"("spaceId");
CREATE INDEX IF NOT EXISTS idx_deal_space_id       ON "Deal"("spaceId");
CREATE INDEX IF NOT EXISTS idx_deal_stage_id       ON "Deal"("stageId");
CREATE INDEX IF NOT EXISTS idx_dealcontact_deal    ON "DealContact"("dealId");
CREATE INDEX IF NOT EXISTS idx_dealcontact_contact ON "DealContact"("contactId");

CREATE INDEX IF NOT EXISTS idx_conversation_space_updated
  ON "Conversation" ("spaceId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_message_conversation_created
  ON "Message" ("conversationId", "createdAt" ASC);
CREATE INDEX IF NOT EXISTS idx_message_space_id    ON "Message"("spaceId");

CREATE UNIQUE INDEX IF NOT EXISTS idx_brokerage_owner     ON "Brokerage"("ownerId");
CREATE INDEX        IF NOT EXISTS idx_brokerage_status    ON "Brokerage"(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_brokerage_join_code ON "Brokerage"("joinCode");
CREATE INDEX IF NOT EXISTS idx_membership_brokerage       ON "BrokerageMembership"("brokerageId");
CREATE INDEX IF NOT EXISTS idx_membership_user            ON "BrokerageMembership"("userId");
CREATE INDEX IF NOT EXISTS idx_invitation_brokerage       ON "Invitation"("brokerageId");
CREATE INDEX IF NOT EXISTS idx_invitation_email           ON "Invitation"(email);
-- token already has a UNIQUE constraint (implicit unique index)
CREATE INDEX IF NOT EXISTS idx_invitation_status          ON "Invitation"(status);

CREATE INDEX IF NOT EXISTS idx_tour_space_starts      ON "Tour"("spaceId", "startsAt" DESC);
CREATE INDEX IF NOT EXISTS idx_tour_contact           ON "Tour"("contactId");
CREATE INDEX IF NOT EXISTS idx_tour_status            ON "Tour"(status);
CREATE INDEX IF NOT EXISTS idx_tour_manage_token      ON "Tour"("manageToken");
CREATE INDEX IF NOT EXISTS idx_tour_property_profile  ON "Tour"("propertyProfileId");

CREATE UNIQUE INDEX IF NOT EXISTS idx_override_space_date
  ON "TourAvailabilityOverride"("spaceId", date);

CREATE INDEX IF NOT EXISTS idx_broker_notif_brokerage
  ON "BrokerNotification"("brokerageId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_broker_notif_unread
  ON "BrokerNotification"("brokerageId", read) WHERE read = false;

CREATE INDEX IF NOT EXISTS idx_audit_clerk_id   ON "AuditLog"("clerkId");
CREATE INDEX IF NOT EXISTS idx_audit_resource   ON "AuditLog"(resource, "resourceId");
CREATE INDEX IF NOT EXISTS idx_audit_space_id   ON "AuditLog"("spaceId");
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON "AuditLog"("createdAt");

CREATE INDEX IF NOT EXISTS idx_doc_embedding_space  ON "DocumentEmbedding"("spaceId");
CREATE INDEX IF NOT EXISTS idx_doc_embedding_entity ON "DocumentEmbedding"("entityId");
CREATE INDEX IF NOT EXISTS idx_doc_embedding_hnsw
  ON "DocumentEmbedding" USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_form_analytics_space
  ON "FormAnalyticsEvent"("spaceId");
CREATE INDEX IF NOT EXISTS idx_form_analytics_session
  ON "FormAnalyticsEvent"("sessionId");
CREATE INDEX IF NOT EXISTS idx_form_analytics_event_type
  ON "FormAnalyticsEvent"("eventType");
CREATE INDEX IF NOT EXISTS idx_form_analytics_created
  ON "FormAnalyticsEvent"("createdAt");
CREATE INDEX IF NOT EXISTS idx_form_analytics_space_created_type
  ON "FormAnalyticsEvent"("spaceId", "createdAt" DESC, "eventType");

CREATE INDEX IF NOT EXISTS idx_form_draft_resume_token
  ON "FormDraft"("resumeToken");
CREATE INDEX IF NOT EXISTS idx_form_draft_space_email
  ON "FormDraft"("spaceId", email);
CREATE INDEX IF NOT EXISTS idx_form_draft_expires_at
  ON "FormDraft"("expiresAt");

-- ============================================================
-- Row-Level Security
-- All tables have RLS enabled. The application uses the Supabase
-- service_role key, which bypasses RLS. RLS protects against
-- accidental exposure of the anon/authenticated keys.
-- No policies are defined — default is DENY ALL for anon/authenticated.
-- ============================================================

ALTER TABLE "User"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Brokerage"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Space"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaceSetting"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contact"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealStage"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TourPropertyProfile"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tour"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Deal"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealContact"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversation"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrokerageMembership"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoogleCalendarToken"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrokerNotification"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TourAvailabilityOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TourWaitlist"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FormAnalyticsEvent"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FormDraft"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentEmbedding"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApplicationMessage"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApplicationStatusUpdate" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- reorder_deal: atomically shift positions and move a deal
-- Runs inside a single transaction, preventing race conditions
-- from concurrent Kanban drag-and-drop reorders.
-- Called via supabase.rpc('reorder_deal', { ... })
-- ============================================================

CREATE OR REPLACE FUNCTION reorder_deal(
  p_deal_id      text,
  p_new_stage_id text,
  p_new_position integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Shift deals at or after the target position up by one to make room
  UPDATE "Deal"
  SET position = position + 1
  WHERE "stageId" = p_new_stage_id
    AND position >= p_new_position
    AND id != p_deal_id;

  -- Place the deal at its new stage and position
  UPDATE "Deal"
  SET "stageId"   = p_new_stage_id,
      position    = p_new_position,
      "updatedAt" = now()
  WHERE id = p_deal_id;
END;
$$;

-- ============================================================
-- match_documents: similarity search RPC used by the AI assistant
-- Called via supabase.rpc('match_documents', { ... })
-- ============================================================

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

-- ============================================================
-- TelemetryEvent: first-value product analytics
-- See lib/telemetry.ts and supabase/migrations/20260518000000_telemetry_event.sql
-- ============================================================

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
