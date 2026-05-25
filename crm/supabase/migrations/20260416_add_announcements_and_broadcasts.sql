-- Platform announcements: admin-managed banners shown to end users.
-- Supports date-bounded display, targeted segments, and severity levels.
CREATE TABLE IF NOT EXISTS "Announcement" (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  title TEXT,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  "targetSegment" TEXT NOT NULL DEFAULT 'all' CHECK ("targetSegment" IN ('all', 'trial', 'active', 'past_due', 'admin')),
  "linkUrl" TEXT,
  "linkLabel" TEXT,
  dismissible BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  "startsAt" TIMESTAMPTZ,
  "endsAt" TIMESTAMPTZ,
  "createdBy" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "Announcement_active_range_idx"
  ON "Announcement" (active, "startsAt", "endsAt");

-- Track per-user dismissals so a banner doesn't re-appear after dismiss.
CREATE TABLE IF NOT EXISTS "AnnouncementDismissal" (
  id TEXT PRIMARY KEY,
  "announcementId" TEXT NOT NULL REFERENCES "Announcement"(id) ON DELETE CASCADE,
  "userId" TEXT NOT NULL,
  "dismissedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("announcementId", "userId")
);

CREATE INDEX IF NOT EXISTS "AnnouncementDismissal_user_idx"
  ON "AnnouncementDismissal" ("userId");

-- Log broadcast emails sent from admin for auditability.
CREATE TABLE IF NOT EXISTS "EmailBroadcast" (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  segment TEXT NOT NULL,
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "sentBy" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "EmailBroadcast_createdAt_idx" ON "EmailBroadcast" ("createdAt" DESC);
