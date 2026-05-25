import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { FollowUpsView } from '@/components/follow-ups/follow-ups-view';
import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Follow-ups — ${slug}` };
}

export default async function FollowUpsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const [contactsResult, dealsResult] = await Promise.all([
    supabase
      .from('Contact')
      .select('id, name, email, phone, type, followUpAt, lastContactedAt, leadScore, scoreLabel, tags')
      .eq('spaceId', space.id)
      .not('followUpAt', 'is', null)
      .order('followUpAt', { ascending: true }),
    supabase
      .from('Deal')
      .select('id, title, address, value, followUpAt')
      .eq('spaceId', space.id)
      .not('followUpAt', 'is', null)
      .order('followUpAt', { ascending: true }),
  ]);

  const contacts = (contactsResult.data ?? []) as any[];
  const deals = (dealsResult.data ?? []) as any[];

  return <FollowUpsView slug={slug} contacts={contacts} deals={deals} />;
}
