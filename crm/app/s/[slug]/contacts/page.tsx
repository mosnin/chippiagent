import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { ContactTable } from '@/components/contacts/contact-table';
import { PeopleTabs } from '@/components/people/people-tabs';

export default async function ContactsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Middleware only requires login; ownership of /s/[slug] is enforced here.
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || userSpace.id !== space.id) notFound();

  // The "New" tab badge — count contacts still flagged 'new-lead'. Visiting
  // /leads clears the flag, so this drops to 0 after the first visit there.
  const { count: newCount } = await supabase
    .from('Contact')
    .select('*', { count: 'exact', head: true })
    .eq('spaceId', space.id)
    .is('brokerageId', null)
    .contains('tags', ['new-lead']);

  // Header lives inside ContactTable so the "Add a person" button shares state
  // with the modal. One client component, one source of truth for the surface.
  return (
    <div className="space-y-6">
      <PeopleTabs slug={slug} newCount={newCount ?? 0} />
      <ContactTable slug={slug} />
    </div>
  );
}
