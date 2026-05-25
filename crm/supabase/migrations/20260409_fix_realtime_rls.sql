-- Fix CRITICAL: Realtime RLS policies were USING (true), allowing any user
-- to subscribe to any space's data via the browser Supabase client.
-- Drop the overly permissive policies and replace with restrictive ones.
-- The anon role should NOT have SELECT access to these tables via realtime.
-- All data access should go through the service role (server-side API routes).

-- Drop the permissive policies
DROP POLICY IF EXISTS "realtime: anon can read contacts by space" ON "Contact";
DROP POLICY IF EXISTS "realtime: anon can read deals by space" ON "Deal";
DROP POLICY IF EXISTS "realtime: anon can read deal_stages by space" ON "DealStage";
DROP POLICY IF EXISTS "realtime: anon can read tours by space" ON "Tour";

-- Create restrictive policies that deny all access to anon role
-- (Service role bypasses RLS, so server-side API routes still work)
CREATE POLICY "deny_anon_contact_select" ON "Contact"
  FOR SELECT TO anon USING (false);

CREATE POLICY "deny_anon_deal_select" ON "Deal"
  FOR SELECT TO anon USING (false);

CREATE POLICY "deny_anon_dealstage_select" ON "DealStage"
  FOR SELECT TO anon USING (false);

CREATE POLICY "deny_anon_tour_select" ON "Tour"
  FOR SELECT TO anon USING (false);
