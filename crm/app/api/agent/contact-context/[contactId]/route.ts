/**
 * GET /api/agent/contact-context/[contactId]
 * Returns the active goal type and most recent agent action for a contact.
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

  // Validate contact belongs to this space
  const { data: contact } = await supabase
    .from('Contact')
    .select('id')
    .eq('id', contactId)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [goalRes, activityRes] = await Promise.all([
    supabase
      .from('AgentGoal')
      .select('goalType')
      .eq('spaceId', space.id)
      .eq('contactId', contactId)
      .eq('status', 'active')
      .order('priority', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('ContactActivity')
      .select('content, createdAt')
      .eq('spaceId', space.id)
      .eq('contactId', contactId)
      .or('content.like.[Agent]%,content.like.[Outcome]%')
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const goalType = goalRes.data?.goalType ?? null;
  let lastAction: string | null = null;
  if (activityRes.data?.content) {
    lastAction = activityRes.data.content
      .replace(/^\[Agent\]\s*/, '')
      .replace(/^\[Outcome\]\s*/, '')
      .slice(0, 80);
  }

  return NextResponse.json({ goalType, lastAction });
}
