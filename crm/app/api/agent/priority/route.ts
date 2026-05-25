/**
 * GET /api/agent/priority
 *
 * Returns today's agent-generated priority focus list.
 * The list is written by the coordinator after each run
 * and stored as a high-importance space memory.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

export interface PriorityItem {
  contactId: string;
  name: string;
  reason: string;
  leadScore: number;
  leadType: 'rental' | 'buyer' | null;
  hasEmail: boolean;
  hasPhone: boolean;
}

export interface PriorityList {
  generatedAt: string;
  items: PriorityItem[];
  totalEvaluated: number;
}

export async function GET(_req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Find the most recent PRIORITY_LIST memory for this space
  const { data } = await supabase
    .from('AgentMemory')
    .select('content, createdAt')
    .eq('spaceId', space.id)
    .eq('entityType', 'space')
    .eq('entityId', space.id)
    .like('content', 'PRIORITY_LIST:%')
    .order('createdAt', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.content) {
    return NextResponse.json({ items: [], generatedAt: null, totalEvaluated: 0 });
  }

  try {
    const json = data.content.replace(/^PRIORITY_LIST:/, '');
    const parsed: PriorityList = JSON.parse(json);
    return NextResponse.json({ ...parsed, memoryCreatedAt: data.createdAt });
  } catch {
    return NextResponse.json({ items: [], generatedAt: null, totalEvaluated: 0 });
  }
}
