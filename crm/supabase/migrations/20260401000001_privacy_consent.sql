-- Privacy policy and consent tracking

-- SpaceSetting: privacy policy URL and custom consent label
ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "privacyPolicyUrl" text,
  ADD COLUMN IF NOT EXISTS "consentCheckboxLabel" text;

-- Contact: consent logging fields (read-only after capture)
ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "consentGiven" boolean,
  ADD COLUMN IF NOT EXISTS "consentTimestamp" timestamptz,
  ADD COLUMN IF NOT EXISTS "consentIp" text,
  ADD COLUMN IF NOT EXISTS "consentPrivacyPolicyUrl" text;
