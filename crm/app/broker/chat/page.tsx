import { getBrokerMemberContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { TeamChatClient } from './team-chat-client';
import type { ChatContact, TeamMember } from './team-chat-client';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Team Chat — Broker Dashboard' };

export default async function TeamChatPage() {
  const ctx = await getBrokerMemberContext();
  if (!ctx) {
    redirect('/');
  }

  const { brokerage } = ctx;

  // Find the broker owner's space
  const { data: ownerSpace } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', brokerage.ownerId)
    .maybeSingle();

  const brokerSpaceId = ownerSpace?.id ?? null;

  // Fetch contacts from the broker's space for @ mentions
  let contacts: ChatContact[] = [];
  if (brokerSpaceId) {
    const { data } = await supabase
      .from('Contact')
      .select('id, name, phone, email, scoreLabel')
      .eq('spaceId', brokerSpaceId)
      .order('createdAt', { ascending: false })
      .limit(50);
    contacts = (data ?? []) as ChatContact[];
  }

  // Fetch team members for @ mentions and slash commands
  const { data: memberships } = await supabase
    .from('BrokerageMembership')
    .select('userId, role')
    .eq('brokerageId', brokerage.id);

  let teamMembers: TeamMember[] = [];
  if (memberships?.length) {
    const userIds = memberships.map((m) => m.userId);
    const { data: users } = await supabase
      .from('User')
      .select('id, name, email')
      .in('id', userIds);

    const roleMap = new Map(
      memberships.map((m) => [m.userId, m.role as string]),
    );

    teamMembers = (users ?? []).map((u) => ({
      id: u.id,
      name: u.name ?? u.email ?? 'Unknown',
      email: u.email ?? null,
      role: roleMap.get(u.id) ?? 'realtor_member',
    }));
  }

  return (
    <TeamChatClient
      contacts={contacts}
      teamMembers={teamMembers}
      brokerageId={brokerage.id}
      currentUserId={ctx.dbUserId}
    />
  );
}
