-- ═══════════════════════════════════════════════════════════════════════════
-- Studio tables — generative-media studio for the realtor's personal brand.
--
--   StudioGeneration — one fal.ai generation request and its result. The
--                      produced image/video is stored as a "File" row, so the
--                      realtor keeps ONE media library (the Files page) — not
--                      a second place. This table is the generation log:
--                      which model, what prompt, what it cost. costUsd is
--                      summed into the realtor's usage by lib/usage/queries.ts
--                      — the same role ExecutionStep.costUsd plays for the
--                      agent runtime.
--
--   StudioPost       — a social post: an asset (File) + caption + target
--                      platforms + a scheduled time. Inngest fires the publish
--                      job; platformResults records the per-platform outcome.
--
--   StudioBrand      — the realtor's brand kit (one row per Space). Logo and
--                      headshot are File references; colors / fonts / handles
--                      let every generation come out on-brand.
--
-- Generated media itself lives in "File" + Wasabi under the `studio/` prefix.
-- These tables hold only metadata. Idempotent: IF NOT EXISTS throughout.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── StudioGeneration ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "StudioGeneration" (
  "id"            text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"       text          NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "userId"        text          NOT NULL,                 -- Clerk userId who generated
  -- The produced asset. NULL while an async job is still running, or
  -- permanently if it failed. SET NULL (not CASCADE) on File delete so the
  -- cost record survives — deleting a file must not erase recorded spend.
  "fileId"        text          REFERENCES "File"("id") ON DELETE SET NULL,
  -- For edits (upscale, background removal, restyle): the source asset.
  -- NULL for from-scratch generations.
  "sourceFileId"  text          REFERENCES "File"("id") ON DELETE SET NULL,
  "kind"          text          NOT NULL CHECK ("kind" IN ('image','video')),
  "model"         text          NOT NULL,                 -- fal.ai model id
  "prompt"        text,
  "status"        text          NOT NULL DEFAULT 'pending'
                    CHECK ("status" IN ('pending','running','completed','failed')),
  -- Authoritative dollar cost of this generation. Summed into realtor usage
  -- by lib/usage/queries.ts.
  "costUsd"       numeric(10,6) NOT NULL DEFAULT 0,
  -- fal.ai queue request id — correlates the async result webhook to this row.
  "falRequestId"  text,
  "errorMessage"  text,
  "completedAt"   timestamptz,
  "createdAt"     timestamptz   NOT NULL DEFAULT now()
);

-- Studio library / recents, and the usage cost-sum query (spaceId + date range).
CREATE INDEX IF NOT EXISTS "StudioGeneration_spaceId_createdAt_idx"
  ON "StudioGeneration" ("spaceId", "createdAt" DESC);

-- Async result webhook correlation.
CREATE INDEX IF NOT EXISTS "StudioGeneration_falRequestId_idx"
  ON "StudioGeneration" ("falRequestId")
  WHERE "falRequestId" IS NOT NULL;

-- ── StudioPost ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "StudioPost" (
  "id"              text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"         text          NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "userId"          text          NOT NULL,
  -- The media being posted. A post is meaningless without its asset, so
  -- CASCADE: deleting the File deletes its posts.
  "fileId"          text          NOT NULL REFERENCES "File"("id") ON DELETE CASCADE,
  "caption"         text          NOT NULL DEFAULT '',
  -- Target platforms: 'instagram' | 'facebook' | 'linkedin' (v1).
  "platforms"       text[]        NOT NULL DEFAULT '{}',
  "scheduledAt"     timestamptz   NOT NULL,
  "status"          text          NOT NULL DEFAULT 'scheduled'
                      CHECK ("status" IN ('scheduled','publishing','posted','failed','canceled')),
  -- Per-platform outcome: { "instagram": { "status", "postUrl", "error" }, ... }
  "platformResults" jsonb         NOT NULL DEFAULT '{}',
  -- Inngest event id for the scheduled publish job — used to cancel / reschedule.
  "inngestEventId"  text,
  "postedAt"        timestamptz,
  "createdAt"       timestamptz   NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz   NOT NULL DEFAULT now()
);

-- Calendar view: a space's posts within a date range.
CREATE INDEX IF NOT EXISTS "StudioPost_spaceId_scheduledAt_idx"
  ON "StudioPost" ("spaceId", "scheduledAt");

-- ── StudioBrand ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "StudioBrand" (
  "id"             text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
  -- One brand kit per Space.
  "spaceId"        text          NOT NULL UNIQUE REFERENCES "Space"("id") ON DELETE CASCADE,
  "logoFileId"     text          REFERENCES "File"("id") ON DELETE SET NULL,
  "headshotFileId" text          REFERENCES "File"("id") ON DELETE SET NULL,
  -- Brand palette — hex strings, primary first.
  "colors"         text[]        NOT NULL DEFAULT '{}',
  -- { "heading": string, "body": string } — font family names.
  "fonts"          jsonb         NOT NULL DEFAULT '{}',
  -- { "instagram": string, "facebook": string, "linkedin": string }.
  "handles"        jsonb         NOT NULL DEFAULT '{}',
  -- Free-text tone guidance the caption writer is primed with.
  "voice"          text,
  "createdAt"      timestamptz   NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz   NOT NULL DEFAULT now()
);

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- The app uses the service role key (which bypasses RLS); these policies guard
-- direct PostgREST / anon-role access only. Matches the spaceId-scoped pattern
-- in 20260601000000_agent_task_tables.sql.

ALTER TABLE "StudioGeneration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudioPost"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudioBrand"      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "studio_generation: space owner only"
  ON "StudioGeneration"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

CREATE POLICY "studio_post: space owner only"
  ON "StudioPost"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );

CREATE POLICY "studio_brand: space owner only"
  ON "StudioBrand"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" WHERE "ownerId" = current_user_internal_id()
    )
  );
