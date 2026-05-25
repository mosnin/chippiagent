import { createClient } from '@supabase/supabase-js';

/**
 * Browser-side Supabase client using the anon (public) key.
 * Used for Realtime subscriptions only — all data mutations
 * still go through API routes using the service role key.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
 * to be set in environment variables.
 */
let _browserClient: ReturnType<typeof createClient> | undefined;

export function getSupabaseBrowser() {
  if (_browserClient) return _browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn('[supabase-browser] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — realtime disabled');
    return null;
  }

  _browserClient = createClient(url, key, {
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });

  return _browserClient;
}
