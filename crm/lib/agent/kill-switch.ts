import { supabase } from '@/lib/supabase';

// 30-second TTL cache to avoid DB hammering on every tool call
const cache = new Map<string, { disabled: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

export async function isSpaceDisabled(spaceId: string): Promise<boolean> {
  // Check cache first
  const cached = cache.get(spaceId);
  if (cached && Date.now() < cached.expiresAt) return cached.disabled;

  // Query DB: SELECT id FROM "DisabledSpace" WHERE "spaceId" = spaceId AND "isActive" = true LIMIT 1
  const { data, error } = await supabase
    .from('DisabledSpace')
    .select('id')
    .eq('spaceId', spaceId)
    .eq('isActive', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`kill-switch: failed to query DisabledSpace: ${error.message}`);
  }

  const disabled = data !== null;

  // Update cache
  cache.set(spaceId, { disabled, expiresAt: Date.now() + CACHE_TTL_MS });

  return disabled;
}

export async function disableSpace(
  spaceId: string,
  reason: string,
  disabledBy = 'system'
): Promise<void> {
  // Upsert: insert a new DisabledSpace row with isActive = true.
  // If one already exists (UNIQUE constraint on spaceId+isActive), update it.
  const { error } = await supabase
    .from('DisabledSpace')
    .upsert(
      { spaceId, reason, disabledBy, isActive: true, reenabledAt: null },
      { onConflict: 'spaceId,isActive' }
    );

  if (error) {
    throw new Error(`kill-switch: failed to disable space ${spaceId}: ${error.message}`);
  }

  // Invalidate cache for this spaceId
  cache.delete(spaceId);
}

export async function reenableSpace(spaceId: string): Promise<void> {
  // UPDATE DisabledSpace SET isActive = false, reenabledAt = now()
  // WHERE spaceId = spaceId AND isActive = true
  const { error } = await supabase
    .from('DisabledSpace')
    .update({ isActive: false, reenabledAt: new Date().toISOString() })
    .eq('spaceId', spaceId)
    .eq('isActive', true);

  if (error) {
    throw new Error(`kill-switch: failed to re-enable space ${spaceId}: ${error.message}`);
  }

  // Invalidate cache
  cache.delete(spaceId);
}

export async function assertSpaceEnabled(spaceId: string): Promise<void> {
  const disabled = await isSpaceDisabled(spaceId);
  if (disabled) {
    throw new Error(`space_disabled:${spaceId}`);
  }
}
