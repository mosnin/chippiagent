-- Create Pipeline table for custom board management
CREATE TABLE IF NOT EXISTS "Pipeline" (
  id TEXT PRIMARY KEY,
  "spaceId" TEXT NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  emoji TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "Pipeline_spaceId_idx" ON "Pipeline"("spaceId");

-- Add pipelineId FK column to DealStage
ALTER TABLE "DealStage" ADD COLUMN IF NOT EXISTS "pipelineId" TEXT REFERENCES "Pipeline"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "DealStage_pipelineId_idx" ON "DealStage"("pipelineId");

-- Drop the pipelineType CHECK constraint so custom pipeline stages are allowed
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = '"DealStage"'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%pipelineType%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "DealStage" DROP CONSTRAINT %I', cname);
  END IF;
END;
$$;

-- Make pipelineType nullable so custom pipeline stages don't require it
ALTER TABLE "DealStage" ALTER COLUMN "pipelineType" DROP NOT NULL;
