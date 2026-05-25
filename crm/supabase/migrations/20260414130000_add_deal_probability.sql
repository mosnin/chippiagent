ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "probability" INTEGER DEFAULT NULL CHECK ("probability" >= 0 AND "probability" <= 100);
