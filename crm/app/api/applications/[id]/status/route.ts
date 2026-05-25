import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireContactAccess } from '@/lib/api-auth';
import { sendStatusUpdateEmail } from '@/lib/email';

const VALID_STATUSES = [
  'received',
  'under_review',
  'tour_scheduled',
  'approved',
  'declined',
  'waitlisted',
] as const;

/**
 * PATCH /api/applications/[id]/status
 *
 * Auth'd endpoint for realtors to update application status.
 * Creates an ApplicationStatusUpdate audit record and sends
 * email notification to applicant.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: contactId } = await params;

  const auth = await requireContactAccess(contactId);
  if (auth instanceof NextResponse) return auth;

  let body: { status?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { status, note } = body;

  if (!status) {
    return NextResponse.json({ error: 'status is required' }, { status: 400 });
  }

  if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }

  // Get current status for audit trail
  const { data: contact, error: fetchError } = await supabase
    .from('Contact')
    .select('applicationStatus, email, name, spaceId, applicationRef')
    .eq('id', contactId)
    .single();

  if (fetchError || !contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  const fromStatus = contact.applicationStatus ?? null;

  // Update contact status
  const update: Record<string, unknown> = {
    applicationStatus: status,
    updatedAt: new Date().toISOString(),
  };
  if (note !== undefined) {
    update.applicationStatusNote = note?.trim() || null;
  }

  const { error: updateError } = await supabase
    .from('Contact')
    .update(update)
    .eq('id', contactId);

  if (updateError) {
    console.error('[status] Update failed:', updateError);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }

  // Create audit trail record
  const { error: auditError } = await supabase.from('ApplicationStatusUpdate').insert({
    contactId,
    spaceId: contact.spaceId,
    fromStatus,
    toStatus: status,
    note: note?.trim() || null,
  });

  if (auditError) {
    console.error('[status] Audit insert failed:', auditError);
    // Non-fatal — status was updated successfully
  }

  // Send email notification to applicant (fire and forget)
  if (contact.email) {
    sendStatusNotification(contact, status, note?.trim() || null).catch((err) =>
      console.error('[status] Email notification failed:', err),
    );
  }

  return NextResponse.json({ success: true, status });
}

async function sendStatusNotification(
  contact: { email: string | null; name: string; spaceId: string; applicationRef: string | null },
  newStatus: string,
  note: string | null,
): Promise<void> {
  if (!contact.email) return;

  // Fetch business name and slug for the email
  const [{ data: space }, { data: settings }] = await Promise.all([
    supabase.from('Space').select('slug, name').eq('id', contact.spaceId).maybeSingle(),
    supabase
      .from('SpaceSetting')
      .select('businessName')
      .eq('spaceId', contact.spaceId)
      .maybeSingle(),
  ]);

  // Look up the portal token so we can include it in the email link
  const { data: contactRow } = await supabase
    .from('Contact')
    .select('statusPortalToken')
    .eq('spaceId', contact.spaceId)
    .eq('applicationRef', contact.applicationRef)
    .maybeSingle();

  const businessName = settings?.businessName ?? space?.name ?? 'Your Agent';
  const slug = space?.slug ?? '';

  await sendStatusUpdateEmail({
    toEmail: contact.email,
    applicantName: contact.name,
    businessName,
    slug,
    applicationRef: contact.applicationRef ?? '',
    statusPortalToken: contactRow?.statusPortalToken ?? null,
    newStatus,
    note,
  });
}
