/**
 * /s/[slug]/chippi/log — the post-tour recorder.
 *
 * The realtor finishes a tour, walks to the car, hits record, dictates a
 * 30-second debrief. Chippi transcribes, proposes 2-5 actions, the realtor
 * approves the batch in one tap. That's the moment.
 *
 * Server component: auth + space resolution. The actual recording UX
 * lives in <PostTourRecorder/>.
 */
import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { PostTourRecorder } from '@/components/chippi/post-tour-recorder';

export const metadata = { title: 'Log a tour — Chippi' };

export default async function PostTourPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  /** `?personId=` and `?dealId=` arrive when the realtor opens this page from
   *  a contact or deal detail. They bias the proposal model toward that
   *  subject so the call/note/follow-up lands on the right record. The page
   *  works fine without them — the recorder UI doesn't change either way. */
  searchParams: Promise<{ personId?: string; dealId?: string }>;
}) {
  const { slug } = await params;
  const { personId, dealId } = await searchParams;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
      <PostTourRecorder
        slug={slug}
        personId={typeof personId === 'string' && personId ? personId : undefined}
        dealId={typeof dealId === 'string' && dealId ? dealId : undefined}
      />
    </div>
  );
}
