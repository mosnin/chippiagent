import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireContactAccess } from '@/lib/api-auth';

/**
 * PATCH — Update application status (agent-facing, authenticated).
 * Used from the contact detail page to change application status.
 * Also creates an ApplicationStatusUpdate audit trail record.
 */
export async function PATCH(req: NextRequest) {
  const { contactId, status, statusNote } = await req.json();

  if (!contactId || !status) {
    return NextResponse.json({ error: 'contactId and status required' }, { status: 400 });
  }

  const validStatuses = ['received', 'under_review', 'tour_scheduled', 'approved', 'needs_info', 'declined', 'waitlisted'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const auth = await requireContactAccess(contactId);
  if (auth instanceof NextResponse) return auth;

  // Get current status for audit trail
  const { data: currentContact } = await supabase
    .from('Contact')
    .select('applicationStatus, spaceId')
    .eq('id', contactId)
    .maybeSingle();

  const update: Record<string, any> = {
    applicationStatus: status,
    updatedAt: new Date().toISOString(),
  };
  if (statusNote !== undefined) {
    update.applicationStatusNote = statusNote?.trim() || null;
  }

  const { error } = await supabase
    .from('Contact')
    .update(update)
    .eq('id', contactId);

  if (error) throw error;

  // Create audit trail record
  if (currentContact) {
    await supabase.from('ApplicationStatusUpdate').insert({
      contactId,
      spaceId: currentContact.spaceId,
      fromStatus: currentContact.applicationStatus ?? null,
      toStatus: status,
      note: statusNote?.trim() || null,
    }).then(({ error: auditErr }) => {
      if (auditErr) console.warn('[status] Audit insert failed (non-fatal):', auditErr);
    });
  }

  return NextResponse.json({ success: true, status });
}
