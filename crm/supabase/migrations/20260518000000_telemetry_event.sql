-- Phase 2 product analytics: first-value telemetry events.
--
-- Captures `signup_completed`, `chippi_first_message`, and
-- `agent_first_action_completed` so the team can measure time-from-signup-
-- to-first-useful-agent-action. Read by lib/telemetry.ts (`emit` /
-- `hasEmitted` / `getFirstEmittedAt`). Analytics layer (Metabase / dbt /
-- future PostHog) reads from this table directly.
--
-- spaceId / userId are nullable because not every event has both (e.g. a
-- broker-only signup may not have a space yet) and we'd rather record a row
-- with a null FK than drop the event.

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
