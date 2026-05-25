/**
 * GET /api/agent/memory
 *
 * Lists Chippi's long-term memory rows for the caller's space, with entity
 * names resolved for display. The agent writes here via the Python memory
 * store; this endpoint is the read side for the user-facing memory surface.
 *
 * Query params:
 *   - entityType: 'contact' | 'deal' | 'space'  (filter)
 *   - memoryType: 'fact' | 'preference' | 'observation' | 'reminder'  (filter)
 *   - search:     free-text content match (ILIKE)
 *   - limit:      max rows, default 100, cap 200
 *
 * Memories with the special PRIORITY_LIST: prefix are excluded — they're
 * coordinator scratch state, not knowledge the realtor cares about.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

export interface MemoryRow {
  id: string;
  memoryType: 'fact' | 'preference' | 'observation' | 'reminder';
  content: string;
  importance: number;
  entityType: 'contact' | 'deal' | 'space' | null;
  entityId: string | null;
  entityName: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const entityType = sp.get('entityType');
  const memoryType = sp.get('memoryType');
  const search = (sp.get('search') ?? '').trim();
  const limit = Math.min(parseInt(sp.get('limit') ?? '100'), 200);

  let query = supabase
    .from('AgentMemory')
    .select('id, memoryType, content, importance, entityType, entityId, expiresAt, createdAt, updatedAt')
    .eq('spaceId', space.id)
    // Exclude coordinator scratch state (priority list, etc.)
    .not('content', 'like', 'PRIORITY_LIST:%')
    .order('importance', { ascending: false })
    .order('createdAt', { ascending: false })
    .limit(limit);

  if (entityType && ['contact', 'deal', 'space'].includes(entityType)) {
    query = query.eq('entityType', entityType);
  }
  if (memoryType && ['fact', 'preference', 'observation', 'reminder'].includes(memoryType)) {
    query = query.eq('memoryType', memoryType);
  }
  if (search) {
    // Postgres ILIKE wildcards on user input — escape % and _ to prevent
    // accidental wildcards from typed text.
    const safe = search.replace(/[%_]/g, (m) => `\\${m}`);
    query = query.ilike('content', `%${safe}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json([]);

  // Resolve entity names in two batched queries
  const contactIds = [...new Set(data.filter((m) => m.entityType === 'contact' && m.entityId).map((m) => m.entityId as string))];
  const dealIds = [...new Set(data.filter((m) => m.entityType === 'deal' && m.entityId).map((m) => m.entityId as string))];

  const [contactsRes, dealsRes] = await Promise.all([
    contactIds.length
      ? supabase.from('Contact').select('id, name').in('id', contactIds).eq('spaceId', space.id)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    dealIds.length
      ? supabase.from('Deal').select('id, title').in('id', dealIds).eq('spaceId', space.id)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);

  const contactNames = new Map((contactsRes.data ?? []).map((c) => [c.id, c.name]));
  const dealNames = new Map((dealsRes.data ?? []).map((d) => [d.id, d.title]));

  const rows: MemoryRow[] = data.map((m) => ({
    id: m.id as string,
    memoryType: m.memoryType as MemoryRow['memoryType'],
    content: m.content as string,
    importance: m.importance as number,
    entityType: (m.entityType as MemoryRow['entityType']) ?? null,
    entityId: (m.entityId as string | null) ?? null,
    entityName:
      m.entityType === 'contact' ? (contactNames.get(m.entityId as string) ?? null) :
      m.entityType === 'deal' ? (dealNames.get(m.entityId as string) ?? null) :
      null,
    expiresAt: (m.expiresAt as string | null) ?? null,
    createdAt: m.createdAt as string,
    updatedAt: m.updatedAt as string,
  }));

  return NextResponse.json(rows);
}
