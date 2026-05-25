-- Phase 7 of the deals redesign: three small-but-daily quality-of-life wins.
--
-- 1. MessageTemplate: canned SMS/email/note bodies with simple {{placeholder}}
--    variables, owned by a space. Realtors write the 10-12 canonical messages
--    they send every week once, then fire them per deal/contact.
--
-- 2. Contact.snoozedUntil: hide a contact from the main People view until a
--    chosen date ("not ready till October"). Reduces the "500-contact
--    inbox" anxiety without deleting real data.
--
-- 3. Contact.referralSource: who sent this lead? Free-form string because
--    sources vary wildly (Jane Doe, Zillow, open house, prior client). Later
--    phases can use this for commission-referral tracking.

CREATE TABLE IF NOT EXISTS "MessageTemplate" (
  id          TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"   TEXT         NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  name        TEXT         NOT NULL,
  channel     TEXT         NOT NULL CHECK (channel IN ('sms', 'email', 'note')),
  subject     TEXT,                                -- email only
  body        TEXT         NOT NULL,
  "createdAt" TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_template_space_updated
  ON "MessageTemplate" ("spaceId", "updatedAt" DESC);

ALTER TABLE "MessageTemplate" ENABLE ROW LEVEL SECURITY;

-- Snooze + referral source on Contact.
ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "snoozedUntil" TIMESTAMPTZ;

ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "referralSource" TEXT;

-- Partial index so unsnoozing / listing snoozed contacts is fast.
CREATE INDEX IF NOT EXISTS idx_contact_snoozed
  ON "Contact" ("spaceId", "snoozedUntil")
  WHERE "snoozedUntil" IS NOT NULL;
