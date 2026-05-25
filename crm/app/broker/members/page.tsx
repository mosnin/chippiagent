import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { MembersClient } from './members-client';

export default async function BrokerMembersPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  const { data: memberships } = await supabase
    .from('BrokerageMembership')
    .select('id, role, createdAt, userId')
    .eq('brokerageId', ctx.brokerage.id)
    .order('createdAt', { ascending: true });

  const rawMembers = (memberships ?? []) as Array<{ id: string; role: string; createdAt: string; userId: string }>;
  const userIds = rawMembers.map((m) => m.userId).filter(Boolean);

  let users: any[] = [];
  let spaces: any[] = [];
  if (userIds.length > 0) {
    const [userRes, spaceRes] = await Promise.all([
      supabase.from('User').select('id, name, email, onboard').in('id', userIds),
      supabase.from('Space').select('ownerId, slug').in('ownerId', userIds),
    ]);
    users = userRes.data ?? [];
    spaces = spaceRes.data ?? [];
  }

  const userMap = new Map(users.map((u: any) => [u.id, u]));
  const spaceMap = new Map(spaces.map((s: any) => [s.ownerId, s]));

  const members = rawMembers.map((m) => ({
    id: m.id,
    role: m.role,
    createdAt: m.createdAt,
    userId: m.userId,
    userName: userMap.get(m.userId)?.name ?? null,
    userEmail: userMap.get(m.userId)?.email ?? null,
    userOnboard: userMap.get(m.userId)?.onboard ?? false,
    spaceSlug: spaceMap.get(m.userId)?.slug ?? null,
  }));

  return (
    <MembersClient
      members={members}
      brokerageName={ctx.brokerage.name}
      currentUserRole={ctx.membership.role}
    />
  );
}
