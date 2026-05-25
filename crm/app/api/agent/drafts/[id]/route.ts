import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { audit } from '@/lib/audit';
import { sendDraft, type DeliveryResult } from '@/lib/delivery';
import { LEVENSHTEIN_CAP, normalizedLevenshtein } from '@/lib/draft-feedback';

/**
 * Pulls feedback fields from the PATCH body and validates them server-side.
 *
 * The client sends raw measurements (Levenshtein distance, decision time).
 * The server is the one that decides what `feedback_action` to record — the
 * client can't lie about whether a draft was edited because we recompute it
 * from the editDistance value the client provides AND from the server-side
 * comparison of original vs. final content. Defense in depth.
 */
function readFeedbackFields(body: Record<string, unknown>): {
  editDistance: number | null;
  decisionMs: number | null;
} {
  const ed = body.editDistance;
  const dm = body.decisionMs;
  const editDistance =
    typeof ed === 'number' && Number.isFinite(ed) && ed >= 0
      ? Math.min(Math.floor(ed), LEVENSHTEIN_CAP)
      : null;
  const decisionMs =
    typeof dm === 'number' && Number.isFinite(dm) && dm >= 0
      ? Math.floor(dm)
      : null;
  return { editDistance, decisionMs };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  const validStatuses = ['approved', 'dismissed'] as const;
  type ActionStatus = (typeof validStatuses)[number];

  const newStatus: ActionStatus | undefined = validStatuses.includes(body.status)
    ? (body.status as ActionStatus)
    : undefined;

  if (!newStatus) {
    return NextResponse.json(
      { error: 'status must be "approved" or "dismissed"' },
      { status: 400 },
    );
  }

  // Verify the draft belongs to this space and is still pending
  const { data: existing, error: fetchError } = await supabase
    .from('AgentDraft')
    .select('id, status, contactId, dealId, channel, subject, content, outcome')
    .eq('id', id)
    .eq('spaceId', space.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (existing.status !== 'pending') {
    return NextResponse.json(
      { error: `Draft is already ${existing.status}` },
      { status: 409 },
    );
  }

  // Allow the realtor to edit content before approving
  let finalContent: string = existing.content;
  if (newStatus === 'approved' && body.content !== undefined) {
    if (typeof body.content !== 'string' || body.content.trim().length === 0) {
      return NextResponse.json({ error: 'content must be a non-empty string' }, { status: 400 });
    }
    finalContent = body.content.trim();
  }

  const { editDistance, decisionMs } = readFeedbackFields(body);

  // ── Dismissed: simple status update ──────────────────────────────────────
  if (newStatus === 'dismissed') {
    const dismissPatch: Record<string, unknown> = {
      status: 'dismissed',
      updatedAt: new Date().toISOString(),
      feedback_action: 'rejected',
    };
    if (decisionMs !== null) dismissPatch.decision_ms = decisionMs;
    if (!existing.outcome) {
      dismissPatch.outcome = 'no_response';
      dismissPatch.outcomeDetectedAt = new Date().toISOString();
    }
    const { data: updated, error: updateError } = await supabase
      .from('AgentDraft')
      .update(dismissPatch)
      .eq('id', id)
      .eq('spaceId', space.id)
      .select()
      .single();

    if (updateError) throw updateError;

    void audit({
      actorClerkId: userId,
      action: 'UPDATE',
      resource: 'AgentDraft',
      resourceId: id,
      spaceId: space.id,
      metadata: { newStatus: 'dismissed', contactId: existing.contactId },
    });

    return NextResponse.json(updated);
  }

  // ── Approved: attempt delivery, then set final status ────────────────────

  // Fetch contact info needed for delivery (email / phone)
  let contact = { name: 'Contact', email: null as string | null, phone: null as string | null };
  if (existing.contactId) {
    const { data: contactRow } = await supabase
      .from('Contact')
      .select('name, email, phone')
      .eq('id', existing.contactId)
      .eq('spaceId', space.id)
      .maybeSingle();
    if (contactRow) contact = contactRow;
  }

  const deliveryResult: DeliveryResult = await sendDraft(
    { channel: existing.channel, subject: existing.subject, content: finalContent },
    contact,
    space.name,
    { spaceId: space.id, userId },
  );

  // sent=true → "sent"; sent=false → "approved" (human reviewed, delivery unconfigured/failed)
  const finalStatus = deliveryResult.sent ? 'sent' : 'approved';

  const patch: Record<string, unknown> = {
    status: finalStatus,
    updatedAt: new Date().toISOString(),
  };
  if (finalContent !== existing.content) patch.content = finalContent;

  // Server-side feedback labelling. The client can pass editDistance, but the
  // action label ('approved' vs. 'edited_and_approved') is decided here so a
  // bad client can't claim 'approved' on text it actually rewrote. We trust
  // the server's own content comparison for the boolean, and the client's
  // editDistance number for the magnitude.
  //
  // Whitespace-normalized comparison: a stray trailing space or a double
  // newline collapsed to a single one is NOT an edit. Otherwise we'd record
  // 'edited_and_approved' on rows where the realtor literally just hit Approve.
  const serverEditDistance = normalizedLevenshtein(existing.content, finalContent);
  const contentChanged = serverEditDistance > 0;
  patch.feedback_action = contentChanged ? 'edited_and_approved' : 'approved';
  patch.edit_distance = contentChanged
    ? (editDistance ?? serverEditDistance)
    : 0;
  if (decisionMs !== null) patch.decision_ms = decisionMs;

  const { data: updated, error: updateError } = await supabase
    .from('AgentDraft')
    .update(patch)
    .eq('id', id)
    .eq('spaceId', space.id)
    .select()
    .single();

  if (updateError) throw updateError;

  void audit({
    actorClerkId: userId,
    action: 'UPDATE',
    resource: 'AgentDraft',
    resourceId: id,
    spaceId: space.id,
    metadata: {
      newStatus: finalStatus,
      contactId: existing.contactId,
      channel: existing.channel,
      contentEdited: contentChanged,
      deliverySent: deliveryResult.sent,
      deliveryError: deliveryResult.error,
      feedbackAction: patch.feedback_action,
      editDistance: patch.edit_distance,
      decisionMs: decisionMs ?? undefined,
    },
  });

  // Return draft + delivery result so the client can show appropriate feedback
  return NextResponse.json({ ...updated, deliveryResult });
}
