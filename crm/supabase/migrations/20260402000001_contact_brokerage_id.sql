-- Add brokerageId to Contact so brokerage intake leads are queryable by brokerage
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "brokerageId" text REFERENCES "Brokerage"(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contact_brokerage ON "Contact"("brokerageId");
