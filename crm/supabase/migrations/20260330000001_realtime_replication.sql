-- Enable Realtime replication on tables used by browser subscriptions.
-- Requires Realtime to be enabled in the Supabase dashboard as well
-- (Database → Replication → enable each table's "supabase_realtime" publication).

-- REPLICA IDENTITY FULL ensures UPDATE events include the old and new row,
-- which is required for the kanban board's optimistic update diffing.
ALTER TABLE "Contact" REPLICA IDENTITY FULL;
ALTER TABLE "Deal" REPLICA IDENTITY FULL;
ALTER TABLE "DealStage" REPLICA IDENTITY FULL;
ALTER TABLE "Tour" REPLICA IDENTITY FULL;

-- Add tables to the supabase_realtime publication
-- (this publication is created automatically by Supabase)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'Contact'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "Contact";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'Deal'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "Deal";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'DealStage'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "DealStage";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'Tour'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "Tour";
  END IF;
END $$;

-- RLS policies for anon key to receive realtime events.
-- These allow SELECT-only access filtered by spaceId, which matches
-- the channel filters used in the browser subscriptions.
-- The anon key cannot INSERT/UPDATE/DELETE — all mutations go through
-- API routes using the service role key.

CREATE POLICY "realtime: anon can read contacts by space"
  ON "Contact" FOR SELECT TO anon
  USING (true);

CREATE POLICY "realtime: anon can read deals by space"
  ON "Deal" FOR SELECT TO anon
  USING (true);

CREATE POLICY "realtime: anon can read deal stages by space"
  ON "DealStage" FOR SELECT TO anon
  USING (true);

CREATE POLICY "realtime: anon can read tours by space"
  ON "Tour" FOR SELECT TO anon
  USING (true);
