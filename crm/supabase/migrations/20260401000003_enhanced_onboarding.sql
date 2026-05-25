-- Enhanced onboarding fields for realtors and brokers

-- Realtor profile fields on User table
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "phone" text,
  ADD COLUMN IF NOT EXISTS "bio" text,
  ADD COLUMN IF NOT EXISTS "socialLinks" jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "websiteUrl" text,
  ADD COLUMN IF NOT EXISTS "mlsId" text,
  ADD COLUMN IF NOT EXISTS "brokerageAffiliation" text,
  ADD COLUMN IF NOT EXISTS "preferredNotification" text DEFAULT 'email'
    CHECK ("preferredNotification" IN ('email', 'sms', 'both')),
  ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS "referralSource" text,
  ADD COLUMN IF NOT EXISTS "biggestPainPoint" text;

-- Brokerage extended fields
ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "officeAddress" text,
  ADD COLUMN IF NOT EXISTS "officePhone" text,
  ADD COLUMN IF NOT EXISTS "agentCount" text,
  ADD COLUMN IF NOT EXISTS "brokerageType" text
    CHECK ("brokerageType" IN ('independent', 'franchise', 'virtual')),
  ADD COLUMN IF NOT EXISTS "primaryMarket" text
    CHECK ("primaryMarket" IN ('residential_rental', 'commercial', 'mixed')),
  ADD COLUMN IF NOT EXISTS "commissionStructure" text
    CHECK ("commissionStructure" IN ('flat_fee', 'percentage_split', 'hybrid')),
  ADD COLUMN IF NOT EXISTS "geographicCoverage" text;
