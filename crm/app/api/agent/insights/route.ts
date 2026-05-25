/**
 * GET /api/agent/insights
 *
 * Returns the most recent high-importance agent memories across all entities
 * in the space, enriched with entity names for display in the dashboard widget.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Recent observations and facts with importance >= 0.3, sorted by recency
  const { data: memories, error } = await supabase
    .from('AgentMemory')
    .select('id, memoryType, content, importance, entityType, entityId, createdAt')
    .eq('spaceId', space.id)
    .gte('importance', 0.3)
    .order('createdAt', { ascending: false })
    .limit(20);

  if (error) throw error;
  if (!memories?.length) return NextResponse.json([]);

  // Collect IDs by entity type to batch-fetch names
  const contactIds = [...new Set(memories.filter(m => m.entityType === 'contact').map(m => m.entityId))];
  const dealIds = [...new Set(memories.filter(m => m.entityType === 'deal').map(m => m.entityId))];

  const [contactsResult, dealsResult] = await Promise.all([
    contactIds.length
      ? supabase.from('Contact').select('id, name').in('id', contactIds).eq('spaceId', space.id)
      : Promise.resolve({ data: [] }),
    dealIds.length
      ? supabase.from('Deal').select('id, title').in('id', dealIds).eq('spaceId', space.id)
      : Promise.resolve({ data: [] }),
  ]);

  const contactNames = new Map((contactsResult.data ?? []).map(c => [c.id, c.name as string]));
  const dealNames = new Map((dealsResult.data ?? []).map(d => [d.id, d.title as string]));

  const insights = memories.map(m => ({
    id: m.id,
    memoryType: m.memoryType,
    content: m.content,
    importance: m.importance,
    entityType: m.entityType,
    entityId: m.entityId,
    entityName:
      m.entityType === 'contact' ? (contactNames.get(m.entityId) ?? null) :
      m.entityType === 'deal' ? (dealNames.get(m.entityId) ?? null) :
      null,
    createdAt: m.createdAt,
  }));

  // Keep top 8 by importance then recency (already sorted by recency, re-sort by importance)
  insights.sort((a, b) => b.importance - a.importance || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json(insights.slice(0, 8));
}
