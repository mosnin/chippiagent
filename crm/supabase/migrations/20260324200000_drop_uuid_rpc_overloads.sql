-- Drop the old UUID-parameter overloads of RPC functions.
-- The fix migration (20260324100000) created TEXT-parameter versions,
-- but the old UUID overloads still exist, causing ambiguous function
-- call errors when Supabase/PostgREST tries to resolve which one to use.

-- Drop old UUID overloads (IF EXISTS so this is safe to re-run)
DROP FUNCTION IF EXISTS book_tour_atomic(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT);
DROP FUNCTION IF EXISTS create_space_with_defaults(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS create_brokerage_with_owner(TEXT, UUID);

-- Also drop the old reorder_deal if it has stale UUID types
-- (current version already uses TEXT — this is a safety net)
