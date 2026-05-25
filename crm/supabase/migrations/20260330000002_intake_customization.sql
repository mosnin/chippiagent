-- Add intake form customization and profile fields to SpaceSetting

ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "bio" text,
  ADD COLUMN IF NOT EXISTS "socialLinks" jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "intakeAccentColor" text DEFAULT '#ff964f',
  ADD COLUMN IF NOT EXISTS "intakeBorderRadius" text DEFAULT 'rounded'
    CHECK ("intakeBorderRadius" IN ('rounded', 'sharp')),
  ADD COLUMN IF NOT EXISTS "intakeFont" text DEFAULT 'system'
    CHECK ("intakeFont" IN ('system', 'serif', 'mono')),
  ADD COLUMN IF NOT EXISTS "intakeFooterLinks" jsonb DEFAULT '[]';
