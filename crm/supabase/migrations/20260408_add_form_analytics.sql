-- Migration: Add form analytics events table
-- Date: 2026-04-08
-- Description: Creates a FormAnalyticsEvent table to track how applicants
--   interact with intake forms — completion rates, drop-off points, time per step.
--   No PII is stored; events are keyed by anonymous sessionId.

-- ============================================================
-- FormAnalyticsEvent table
-- ============================================================

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

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_form_analytics_space
  ON "FormAnalyticsEvent"("spaceId");

CREATE INDEX IF NOT EXISTS idx_form_analytics_session
  ON "FormAnalyticsEvent"("sessionId");

CREATE INDEX IF NOT EXISTS idx_form_analytics_event_type
  ON "FormAnalyticsEvent"("eventType");

CREATE INDEX IF NOT EXISTS idx_form_analytics_created
  ON "FormAnalyticsEvent"("createdAt");

-- Composite index for the most common query pattern (space + time range + event type)
CREATE INDEX IF NOT EXISTS idx_form_analytics_space_created_type
  ON "FormAnalyticsEvent"("spaceId", "createdAt" DESC, "eventType");

-- ============================================================
-- Row-Level Security
-- ============================================================

ALTER TABLE "FormAnalyticsEvent" ENABLE ROW LEVEL SECURITY;
