-- Track when a user's trial was first consumed (prevents repeat trials)
ALTER TABLE "Space" ADD COLUMN IF NOT EXISTS "trialUsedAt" timestamptz;
