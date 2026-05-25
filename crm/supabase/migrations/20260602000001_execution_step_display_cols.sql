-- Add display columns to ExecutionStep and relax the stepIndex NOT NULL constraint.
--
-- The original schema defined stepIndex as NOT NULL with no default, which means
-- every INSERT must supply it. The runtime logger doesn't track a sequential index
-- (steps are written fire-and-forget), so this is an unenforceable requirement.
-- We set a default of 0 so inserts that don't supply a value still succeed.
--
-- stepType, inputSummary, and outputSummary are read by the StepTimeline component
-- but were absent from the original schema. Adding them here closes the mismatch.
--
-- Idempotent: IF NOT EXISTS / SET DEFAULT are safe to re-run.

ALTER TABLE "ExecutionStep"
  ADD COLUMN IF NOT EXISTS "stepType"      text NOT NULL DEFAULT 'tool_call',
  ADD COLUMN IF NOT EXISTS "inputSummary"  text,
  ADD COLUMN IF NOT EXISTS "outputSummary" text;

ALTER TABLE "ExecutionStep"
  ALTER COLUMN "stepIndex" SET DEFAULT 0;
