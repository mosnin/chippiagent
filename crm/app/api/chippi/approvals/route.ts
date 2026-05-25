/**
 * GET /api/chippi/approvals
 *
 * Returns the list of AgentTask rows that are paused awaiting human
 * approval, for the caller's space. Mirrors the query that powers
 * `/s/[slug]/chippi/approvals/page.tsx` so the slide-over pill in the
 * Chippi header can render the same data without a route change.
 *
 * Response: { count: number, tasks: ApprovalTask[] }
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
  if (!space) return NextResponse.json({ count: 0, tasks: [] });

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

  const tasks = (data ?? []) as ApprovalTask[];
  return NextResponse.json({ count: tasks.length, tasks });
}
