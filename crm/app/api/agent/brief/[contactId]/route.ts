/**
 * GET /api/agent/brief/[contactId]
 *
 * Returns the agent's latest brief and score explanation for a contact.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { contactId } = await params;

  // Verify contact belongs to this space
  const { data: contact } = await supabase
    .from('Contact')
    .select('id')
    .eq('id', contactId)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Fetch the two special memory types
  const { data: memories } = await supabase
    .from('AgentMemory')
    .select('content, createdAt, memoryType')
    .eq('spaceId', space.id)
    .eq('entityType', 'contact')
    .eq('entityId', contactId)
    .or('content.like.AGENT_BRIEF:%,content.like.SCORE_EXPLANATION:%')
    .order('createdAt', { ascending: false })
    .limit(10);

  let brief: string | null = null;
  let briefUpdatedAt: string | null = null;
  let scoreExplanation: string | null = null;
  let explainedScore: number | null = null;

  for (const m of memories ?? []) {
    if (!brief && m.content.startsWith('AGENT_BRIEF:')) {
      brief = m.content.replace('AGENT_BRIEF:', '');
      briefUpdatedAt = m.createdAt;
    }
    if (!scoreExplanation && m.content.startsWith('SCORE_EXPLANATION:')) {
      const rest = m.content.replace('SCORE_EXPLANATION:', '');
      const colonIdx = rest.indexOf(':');
      if (colonIdx > 0) {
        explainedScore = parseInt(rest.slice(0, colonIdx), 10);
        scoreExplanation = rest.slice(colonIdx + 1);
      }
    }
    if (brief && scoreExplanation) break;
  }

  return NextResponse.json({ brief, briefUpdatedAt, scoreExplanation, explainedScore });
}
