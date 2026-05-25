-- Intake form customization: visual, content, and form field control

-- Visual customization
ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "intakeHeaderBgColor" text,
  ADD COLUMN IF NOT EXISTS "intakeHeaderGradient" text,
  ADD COLUMN IF NOT EXISTS "intakeDarkMode" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "intakeFaviconUrl" text;

-- Content customization
ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "intakeThankYouTitle" text,
  ADD COLUMN IF NOT EXISTS "intakeThankYouMessage" text,
  ADD COLUMN IF NOT EXISTS "intakeConfirmationEmail" text,
  ADD COLUMN IF NOT EXISTS "intakeVideoUrl" text,
  ADD COLUMN IF NOT EXISTS "intakeDisclaimerText" text;

-- Form field control
ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "intakeDisabledSteps" text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "intakeRequiredFields" text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "intakeCustomQuestions" jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "intakeStepOrder" text[] DEFAULT '{}';
