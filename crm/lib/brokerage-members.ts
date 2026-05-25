import { supabase } from '@/lib/supabase';

export interface BrokerageMember {
  id: string;
  role: string;
  createdAt: string;
  userId: string;
  User: { id: string; name: string | null; email: string; onboard?: boolean } | null;
  Space: { id?: string; slug?: string; name?: string } | null;
}

/**
 * Fetch brokerage members with User and Space data.
 * Uses separate queries to avoid PostgREST ambiguous FK issues
 * (BrokerageMembership has two FKs to User: userId and invitedById).
 */
export async function getBrokerageMembers(
  brokerageId: string,
  opts?: { includeOnboard?: boolean; includeSpaceName?: boolean }
): Promise<BrokerageMember[]> {
  const { data: memberships } = await supabase
    .from('BrokerageMembership')
    .select('id, role, createdAt, userId')
    .eq('brokerageId', brokerageId)
    .order('createdAt', { ascending: true });

  const raw = memberships ?? [];
  if (raw.length === 0) return [];

  const userIds = raw.map((m) => m.userId).filter(Boolean);

  const userSelect = opts?.includeOnboard ? 'id, name, email, onboard' : 'id, name, email';
  const spaceSelect = opts?.includeSpaceName ? 'ownerId, id, slug, name' : 'ownerId, id, slug';

  const [{ data: users }, { data: spaces }] = await Promise.all([
    supabase.from('User').select(userSelect).in('id', userIds),
    supabase.from('Space').select(spaceSelect).in('ownerId', userIds),
  ]);

  const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));
  const spaceMap = new Map((spaces ?? []).map((s: any) => [s.ownerId, s]));

  return raw.map((m) => ({
    id: m.id,
    role: m.role,
    createdAt: m.createdAt,
    userId: m.userId,
    User: userMap.get(m.userId) ?? null,
    Space: spaceMap.get(m.userId) ?? null,
  }));
}
