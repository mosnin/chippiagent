-- Intake trust signals: optional realtor-supplied compliance slots that
-- render in the public intake chat footer. Chippi provides the rendering
-- slot; the realtor/brokerage supplies the actual legal text — we never
-- inject legal copy on their behalf.
--
--   intakeLicenseNumber       — real-estate license # (e.g. "TX-RE-12345")
--   intakeFairHousingNotice   — brokerage-supplied Fair Housing statement
--                               (plain text, multi-line supported via
--                               whitespace-pre-line on render).
--   intakeShowEqualHousingMark — when true, render the standard Equal
--                                Housing Opportunity logo SVG.

ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "intakeLicenseNumber" text,
  ADD COLUMN IF NOT EXISTS "intakeFairHousingNotice" text,
  ADD COLUMN IF NOT EXISTS "intakeShowEqualHousingMark" boolean NOT NULL DEFAULT false;
