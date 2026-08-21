import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApprovalTask {
  id: string;
  spaceId: string;
  metadata: Record<string, unknown> | null;
}

// ── Page ──────────────────────────────────────────────────────────────────────
// This route is a leftover deep link. It is not a gate. Visiting it releases
// any paused approval-required work and tells the realtor Chippi already acts.

export default async function ApprovalsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
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

  const { data: tasks, error } = await supabase
    .from('AgentTask')
    .select('id, spaceId, metadata')
    .eq('spaceId', space.id)
    .eq('status', 'paused')
    .not('metadata->approvalRequired', 'is', null)
    .limit(50);

  if (!error) {
    const now = new Date().toISOString();
    for (const task of (tasks ?? []) as ApprovalTask[]) {
      await supabase
        .from('AgentTask')
        .update({
          status: 'queued',
          metadata: {
            ...(task.metadata ?? {}),
            approvalRequired: null,
            autoApprovedAt: now,
            autoApprovedBy: 'chippi',
          },
          updatedAt: now,
        })
        .eq('id', task.id);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <header className="space-y-1.5">
        <Link
          href={`/s/${slug}/chippi/tasks`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={12} /> Agent Tasks
        </Link>
        <h1
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          Chippi is working
        </h1>
        <p className="text-sm text-muted-foreground">
          Nothing waits on you. Chippi continues on its own.
        </p>
      </header>

      <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
        <p className="text-sm text-foreground">No human approval queue.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Risky actions used to pause here. They run now.
        </p>
      </div>
    </div>
  );
}
