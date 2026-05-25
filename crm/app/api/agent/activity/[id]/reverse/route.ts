/**
 * POST /api/agent/activity/[id]/reverse
 *
 * Undo an autonomous action Chippi took. Reverses the side effect when the
 * action type is in the supported set, then marks the activity log row's
 * reversedAt so the UI can show "undone" state. The Python agent flags
 * actions as `reversible` at log time; we additionally check our own
 * supported-types list because not every reversible-flagged action has a
 * server-side undo path yet.
 *
 * Supported (v1):
 *   - set_contact_follow_up   → clears Contact.followUpAt
 *   - set_deal_follow_up      → clears Deal.followUpAt
 *
 * Anything else returns 400 with an explanation. Future action types
 * (notes, memory, lead-score) get added to UNDO_HANDLERS as their reversal
 * paths are encoded.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

type UndoHandler = (params: {
  spaceId: string;
  relatedContactId: string | null;
  relatedDealId: string | null;
}) => Promise<{ ok: true } | { ok: false; reason: string }>;

const UNDO_HANDLERS: Record<string, UndoHandler> = {
  async set_contact_follow_up({ spaceId, relatedContactId }) {
    if (!relatedContactId) return { ok: false, reason: 'No contact tied to this action.' };
    const { error } = await supabase
      .from('Contact')
      .update({ followUpAt: null, updatedAt: new Date().toISOString() })
      .eq('id', relatedContactId)
      .eq('spaceId', spaceId);
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  },
  async set_deal_follow_up({ spaceId, relatedDealId }) {
    if (!relatedDealId) return { ok: false, reason: 'No deal tied to this action.' };
    const { error } = await supabase
      .from('Deal')
      .update({ followUpAt: null, updatedAt: new Date().toISOString() })
      .eq('id', relatedDealId)
      .eq('spaceId', spaceId);
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  },
};

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Fetch + scope-check in one query
  const { data: row, error: fetchError } = await supabase
    .from('AgentActivityLog')
    .select('id, spaceId, actionType, relatedContactId, relatedDealId, reversible, reversedAt')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (row.reversedAt) {
    return NextResponse.json({ error: 'Already reversed.' }, { status: 409 });
  }
  if (!row.reversible) {
    return NextResponse.json({ error: "This action can't be undone." }, { status: 400 });
  }

  const handler = UNDO_HANDLERS[row.actionType as string];
  if (!handler) {
    return NextResponse.json(
      { error: "Undo isn't supported for this action type yet." },
      { status: 400 },
    );
  }

  const result = await handler({
    spaceId: space.id,
    relatedContactId: row.relatedContactId as string | null,
    relatedDealId: row.relatedDealId as string | null,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 500 });
  }

  // Mark reversed so the UI knows + future GETs filter it out of "undoable"
  const reversedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('AgentActivityLog')
    .update({ reversedAt })
    .eq('id', id)
    .eq('spaceId', space.id);
  if (updateError) {
    // The side effect was reversed but the log update failed. Surface this
    // honestly — caller can refresh to see the field-level change.
    return NextResponse.json(
      { error: 'Reversed, but failed to update activity log.', warning: true },
      { status: 200 },
    );
  }

  return NextResponse.json({ ok: true, reversedAt });
}
