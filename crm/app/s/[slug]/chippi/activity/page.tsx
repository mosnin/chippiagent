import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ActivityFeed } from '@/components/chippi/activity-feed';
import { PageTitle } from '@/components/ui/page-title';

export const metadata = { title: 'What I did — Chippi' };

export default async function ChippiActivityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Verify ownership before rendering
  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-2">
      <Link
        href={`/s/${slug}/chippi`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={12} />
        Back to Chippi
      </Link>
      <PageTitle label="Chippi." subtitle="Every action Chippi has taken — with reasoning. Undo anything reversible.">
        What I did
      </PageTitle>

      <ActivityFeed slug={slug} />
    </div>
  );
}
