import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { LEVENSHTEIN_CAP } from '@/lib/draft-feedback';

/**
 * Per-draft feedback ping that does NOT change a draft's terminal status.
 *
 * The /[id] PATCH route handles the two cases that flip a draft's status —
 * 'approved' and 'dismissed'. Those carry feedback fields piggybacked.
 *
 * This endpoint exists for the third case: the realtor sees a draft, taps
 * "Hold for later", and the draft stays pending. We still want the signal
 * — "this realtor wasn't ready to act on this" is data — but the draft's
 * lifecycle hasn't ended, so it shouldn't share the PATCH path.
 *
 * Scope: only 'held' is accepted here. 'approved' / 'edited_and_approved' /
 * 'rejected' all go through the main PATCH so the status update and the
 * signal land in one transaction.
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const draftId = typeof body.draftId === 'string' ? body.draftId : null;
  const action = body.action;
  if (!draftId) {
    return NextResponse.json({ error: 'draftId required' }, { status: 400 });
  }
  if (action !== 'held') {
    return NextResponse.json(
      { error: "action must be 'held' (terminal actions go through PATCH /api/agent/drafts/[id])" },
      { status: 400 },
    );
  }

  const dm = body.decisionMs;
  const decisionMs =
    typeof dm === 'number' && Number.isFinite(dm) && dm >= 0
      ? Math.floor(dm)
      : null;

  const ed = body.editDistance;
  const editDistance =
    typeof ed === 'number' && Number.isFinite(ed) && ed >= 0
      ? Math.min(Math.floor(ed), LEVENSHTEIN_CAP)
      : null;

  // Only record feedback on drafts that are still pending. If the draft has
  // already terminated, this ping is stale — drop it on the floor instead of
  // overwriting the terminal feedback_action.
  const { data: existing } = await supabase
    .from('AgentDraft')
    .select('id, status, feedback_action')
    .eq('id', draftId)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.status !== 'pending') {
    // Idempotent no-op — the realtor held something we already terminated.
    return NextResponse.json({ ok: true, skipped: true });
  }

  const patch: Record<string, unknown> = { feedback_action: 'held' };
  if (decisionMs !== null) patch.decision_ms = decisionMs;
  if (editDistance !== null) patch.edit_distance = editDistance;

  const { error } = await supabase
    .from('AgentDraft')
    .update(patch)
    .eq('id', draftId)
    .eq('spaceId', space.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
