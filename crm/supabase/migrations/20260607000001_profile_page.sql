-- ═══════════════════════════════════════════════════════════════════════════
-- ProfilePage — per-realtor config for their public "link in bio" page at
-- /p/[slug]. One row per space.
--
-- Branding (name, photo, bio, social links) is read live from SpaceSetting,
-- the same source the intake and booking pages use. This table holds only
-- the page-specific bits: which sections show, the custom links, headline.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "ProfilePage" (
  "id"             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"        text NOT NULL UNIQUE REFERENCES "Space"("id") ON DELETE CASCADE,
  -- Whether the public page is live. false = /p/[slug] 404s.
  "enabled"        boolean NOT NULL DEFAULT true,
  "headline"       text,
  "showIntake"     boolean NOT NULL DEFAULT true,
  "showTours"      boolean NOT NULL DEFAULT true,
  "showProperties" boolean NOT NULL DEFAULT true,
  -- Realtor-added links: [{ id, label, url }].
  "customLinks"    jsonb   NOT NULL DEFAULT '[]',
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "ProfilePage" ENABLE ROW LEVEL SECURITY;
