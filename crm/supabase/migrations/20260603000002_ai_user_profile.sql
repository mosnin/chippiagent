-- AIUserProfile: realtor self-description used to personalize Chippi's responses.
-- One row per Space. Linked to Space.id (not User) so it travels with the workspace.
--
-- Fields:
--   displayName              — how the realtor refers to themselves in Chippi context
--   businessFocus            — array of focus areas (e.g. 'luxury', 'first-time buyers')
--   yearsExperience          — used to calibrate depth of Chippi's explanations
--   workingStyle             — free-text self-description of work habits
--   communicationTone        — preferred tone Chippi should adopt in outputs
--   currentGoals             — short-term objectives Chippi should keep in mind
--   quirksAndPreferences     — catch-all for anything that doesn't fit above
--   agentPersonalizationNote — internal note Chippi can read/write to itself over time
--
-- Idempotent: IF NOT EXISTS guards throughout. Safe to re-run.

-- ── AIUserProfile ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "AIUserProfile" (
  "id"                       text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"                  text        NOT NULL UNIQUE REFERENCES "Space"(id) ON DELETE CASCADE,
  "displayName"              text,
  "businessFocus"            text[]      NOT NULL DEFAULT '{}',
  "yearsExperience"          integer,
  "workingStyle"             text,
  "communicationTone"        text,
  "currentGoals"             text,
  "quirksAndPreferences"     text,
  "agentPersonalizationNote" text,
  "createdAt"                timestamptz NOT NULL DEFAULT now(),
  "updatedAt"                timestamptz NOT NULL DEFAULT now()
);

-- Primary access pattern: look up the profile for a given space.
CREATE INDEX IF NOT EXISTS "AIUserProfile_spaceId_idx" ON "AIUserProfile"("spaceId");

-- ── Row-Level Security ────────────────────────────────────────────────────────
-- The app uses the service role key (which bypasses RLS), so these policies
-- guard against direct PostgREST / anon-role access only. Pattern matches the
-- existing spaceId-scoped policies in 20260314000000_rls_policies.sql.

ALTER TABLE "AIUserProfile" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_user_profile: space owner only"
  ON "AIUserProfile"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );
