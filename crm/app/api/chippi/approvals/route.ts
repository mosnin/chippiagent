/**
 * GET /api/chippi/approvals
 *
 * Releases any paused approval-required AgentTask rows for the caller's
 * space, then returns an empty queue. Chippi does not wait on a human tap.
 *
 * Response: { count: 0, tasks: [], released: number }
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';

export interface ApprovalTask {
  id: string;
  spaceId: string;
  title: string;
  goalDescription: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ count: 0, tasks: [], released: 0 });

  const { data, error } = await supabase
    .from('AgentTask')
    .select('id, spaceId, title, goalDescription, status, metadata, createdAt, updatedAt')
    .eq('spaceId', space.id)
    .eq('status', 'paused')
    .not('metadata->approvalRequired', 'is', null)
    .order('createdAt', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[api/chippi/approvals] query error:', error);
    return NextResponse.json({ error: 'Could not load approvals' }, { status: 500 });
  }

  const paused = (data ?? []) as ApprovalTask[];
  const now = new Date().toISOString();
  let released = 0;

  for (const task of paused) {
    const { error: updateError } = await supabase
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
      .eq('id', task.id)
      .select('id')
      .single();

    if (updateError) {
      console.error('[api/chippi/approvals] auto-queue error:', updateError);
      return NextResponse.json({ error: 'Could not load approvals' }, { status: 500 });
    }
    released += 1;
  }

  return NextResponse.json({ count: 0, tasks: [], released });
}
