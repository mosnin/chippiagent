import { supabase } from '@/lib/supabase';
import { normalizeSlug } from '@/lib/intake';
import type { Space } from '@/lib/types';

export async function getSpaceFromSlug(inputSlug: string): Promise<Space | null> {
  const slug = normalizeSlug(inputSlug);
  const { data, error } = await supabase
    .from('Space')
    .select('id, slug, name, emoji, ownerId, brokerageId, createdAt, stripeSubscriptionStatus')
    .eq('slug', slug)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Space) ?? null;
}

export async function getSpaceByOwnerId(ownerId: string): Promise<Space | null> {
  const { data, error } = await supabase
    .from('Space')
    .select('*')
    .eq('ownerId', ownerId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Space) ?? null;
}

export async function getSpaceForUser(clerkUserId: string): Promise<Space | null> {
  // Two queries but they're simple index lookups — keeping sequential to avoid
  // PostgREST FK constraint name ambiguity with inline references
  const { data: user, error: userErr } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', clerkUserId)
    .limit(1)
    .maybeSingle();
  if (userErr) throw userErr;
  if (!user) return null;

  const { data, error } = await supabase
    .from('Space')
    .select('id, slug, name, emoji, ownerId, brokerageId, createdAt')
    .eq('ownerId', user.id)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Space) ?? null;
}
