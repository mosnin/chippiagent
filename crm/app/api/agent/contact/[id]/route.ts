/**
 * GET /api/agent/contact/[id]
 *
 * Returns agent intelligence context for a single contact:
 *   - memories (facts + observations stored by agents across runs)
 *   - pending drafts for this contact
 *   - recent agent activity log entries
 *
 * Secured with Clerk auth. Contact must belong to the caller's space.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: contactId } = await params;

  // Verify contact belongs to this space
  const { data: contact, error: contactError } = await supabase
    .from('Contact')
    .select('id, name')
    .eq('id', contactId)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (contactError) throw contactError;
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

  const [memoriesResult, draftsResult, activityResult] = await Promise.all([
    supabase
      .from('AgentMemory')
      .select('id, memoryType, content, importance, createdAt')
      .eq('spaceId', space.id)
      .eq('entityType', 'contact')
      .eq('entityId', contactId)
      .order('importance', { ascending: false })
      .order('createdAt', { ascending: false })
      .limit(20),

    supabase
      .from('AgentDraft')
      .select('id, channel, subject, content, reasoning, priority, status, createdAt')
      .eq('spaceId', space.id)
      .eq('contactId', contactId)
      .in('status', ['pending', 'approved'])
      .order('createdAt', { ascending: false })
      .limit(10),

    supabase
      .from('AgentActivityLog')
      .select('id, agentType, action, outcome, summary, contactId, createdAt')
      .eq('spaceId', space.id)
      .eq('contactId', contactId)
      .order('createdAt', { ascending: false })
      .limit(15),
  ]);

  return NextResponse.json({
    contactId,
    memories: memoriesResult.data ?? [],
    drafts: draftsResult.data ?? [],
    activity: activityResult.data ?? [],
  });
}
