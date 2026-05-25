-- Add 'seller' as a valid lead type and pipeline type.
-- PostgreSQL auto-names inline column constraints as {table}_{column}_check;
-- drop the old constraints and re-add with the extended value list.

ALTER TABLE "Contact"
  DROP CONSTRAINT IF EXISTS "Contact_leadType_check";
ALTER TABLE "Contact"
  ADD CONSTRAINT "Contact_leadType_check"
  CHECK ("leadType" IN ('rental', 'buyer', 'seller'));

ALTER TABLE "DealStage"
  DROP CONSTRAINT IF EXISTS "DealStage_pipelineType_check";
ALTER TABLE "DealStage"
  ADD CONSTRAINT "DealStage_pipelineType_check"
  CHECK ("pipelineType" IN ('rental', 'buyer', 'seller'));

-- Extend the idx_contact_lead_type index (already exists; no change needed —
-- it indexes by spaceId + leadType which naturally covers seller rows).
