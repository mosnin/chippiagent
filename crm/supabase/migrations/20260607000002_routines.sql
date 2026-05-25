-- ═══════════════════════════════════════════════════════════════════════════
-- Routine — a standing instruction for Chippi: a sentence and a time.
--
-- The realtor writes one English instruction and picks how often it runs.
-- An hourly Vercel cron (/api/cron/routines) finds rows whose nextRunAt has
-- passed and fires the Modal autonomous run with the instruction attached.
-- Like every autonomous path, the run DRAFTS — it never sends unattended.
--
-- nextRunAt is never set by a caller. The routine_set_next_run trigger
-- recomputes it from (cadence, hour, now()) on every INSERT and UPDATE, so
-- the API route, the agent tool, and the cron all stay honest with one
-- source of truth: the database.
-- ═══════════════════════════════════════════════════════════════════════════

-- Pure scheduling math: the next time a routine should fire, strictly after
-- p_from. IMMUTABLE — deterministic given its inputs (reads no clock itself).
CREATE OR REPLACE FUNCTION routine_next_run_at(
  p_cadence text,
  p_hour    integer,
  p_from    timestamptz
) RETURNS timestamptz AS $$
DECLARE
  candidate timestamptz;
BEGIN
  -- hourly: the next top of the hour.
  IF p_cadence = 'hourly' THEN
    RETURN date_trunc('hour', p_from) + interval '1 hour';
  END IF;

  -- daily / weekdays: the next p_hour:00 UTC strictly after p_from.
  candidate := date_trunc('day', p_from) + make_interval(hours => p_hour);
  IF candidate <= p_from THEN
    candidate := candidate + interval '1 day';
  END IF;

  -- weekdays: roll forward off Saturday (6) and Sunday (0).
  IF p_cadence = 'weekdays' THEN
    WHILE extract(dow FROM candidate) IN (0, 6) LOOP
      candidate := candidate + interval '1 day';
    END LOOP;
  END IF;

  RETURN candidate;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE TABLE IF NOT EXISTS "Routine" (
  "id"            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"       text NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  -- The sentence. One English instruction the autonomous run receives verbatim.
  "instruction"   text NOT NULL,
  -- How often it runs. hour is the UTC hour 0-23; ignored when cadence='hourly'.
  "cadence"       text NOT NULL DEFAULT 'daily'
                    CHECK ("cadence" IN ('hourly', 'daily', 'weekdays')),
  "hour"          integer NOT NULL DEFAULT 13
                    CHECK ("hour" BETWEEN 0 AND 23),
  "enabled"       boolean NOT NULL DEFAULT true,
  -- Set by the cron when it dispatches a run. status reflects whether the
  -- Modal webhook accepted the job, not the run's eventual outcome — the
  -- realtor reads the Activity feed for what the run actually did.
  "lastRunAt"     timestamptz,
  "lastRunStatus" text CHECK ("lastRunStatus" IN ('ok', 'error')),
  -- Always trigger-managed. Never written by a caller.
  "nextRunAt"     timestamptz NOT NULL,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

-- The cron's hot path: enabled routines that are due.
CREATE INDEX IF NOT EXISTS "Routine_due_idx"
  ON "Routine" ("nextRunAt") WHERE "enabled" = true;
-- The realtor's list view.
CREATE INDEX IF NOT EXISTS "Routine_space_idx"
  ON "Routine" ("spaceId");

-- Keep nextRunAt and updatedAt honest. Runs BEFORE the NOT NULL check, so
-- nextRunAt needs no column default — the trigger is the only writer.
CREATE OR REPLACE FUNCTION routine_set_next_run() RETURNS trigger AS $$
BEGIN
  NEW."nextRunAt"  := routine_next_run_at(NEW."cadence", NEW."hour", now());
  NEW."updatedAt"  := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Routine_next_run" ON "Routine";
CREATE TRIGGER "Routine_next_run"
  BEFORE INSERT OR UPDATE ON "Routine"
  FOR EACH ROW EXECUTE FUNCTION routine_set_next_run();

-- Access is service-role only, same as ProfilePage. Every read and write
-- goes through an API route that does its own auth + space-ownership check.
ALTER TABLE "Routine" ENABLE ROW LEVEL SECURITY;
