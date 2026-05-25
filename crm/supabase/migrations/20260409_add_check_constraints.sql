-- Add CHECK constraints to enum-like TEXT columns
ALTER TABLE "Contact" DROP CONSTRAINT IF EXISTS contact_scoring_status_check;
ALTER TABLE "Contact" ADD CONSTRAINT contact_scoring_status_check
  CHECK ("scoringStatus" IN ('pending', 'scored', 'failed'));

ALTER TABLE "Contact" DROP CONSTRAINT IF EXISTS contact_lead_type_check;
ALTER TABLE "Contact" ADD CONSTRAINT contact_lead_type_check
  CHECK ("leadType" IN ('rental', 'buyer'));

ALTER TABLE "Deal" DROP CONSTRAINT IF EXISTS deal_status_check;
ALTER TABLE "Deal" ADD CONSTRAINT deal_status_check
  CHECK (status IN ('active', 'won', 'lost', 'on_hold'));

ALTER TABLE "Deal" DROP CONSTRAINT IF EXISTS deal_priority_check;
ALTER TABLE "Deal" ADD CONSTRAINT deal_priority_check
  CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH'));
