import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { z } from 'zod';

const addNoteSchema = z.object({
  contactId: z.string().uuid('Invalid contact ID'),
  note: z.string().min(1, 'Note cannot be empty').max(2000, 'Note too long'),
});

/**
 * POST /api/broker/lead-note
 *
 * Appends a broker note to a contact's notes field.
 * The note is prefixed with "[Broker: Name - Date]" so realtors can see who wrote it.
 * Works on contacts in both the broker's space (unassigned) and realtor spaces (assigned).
 */
export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { brokerage, dbUserId } = ctx;

  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = addNoteSchema.safeParse(requestBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request data', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { contactId, note } = parsed.data;

  try {
    // Get broker user's name
    const { data: brokerUser } = await supabase
      .from('User')
      .select('name, email')
      .eq('id', dbUserId)
      .maybeSingle();
    const brokerName = brokerUser?.name ?? brokerUser?.email ?? 'Broker';

    // Find the broker's space
    const { data: ownerSpace } = await supabase
      .from('Space')
      .select('id')
      .eq('ownerId', brokerage.ownerId)
      .maybeSingle();
    const brokerSpaceId = ownerSpace?.id ?? null;

    // First check: is this contact in the broker's own space?
    const { data: contact } = await supabase
      .from('Contact')
      .select('id, notes, spaceId, applicationStatusNote')
      .eq('id', contactId)
      .maybeSingle();

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Verify the contact belongs to broker space or a realtor in this brokerage
    let authorized = false;

    if (contact.spaceId === brokerSpaceId) {
      authorized = true;
    } else {
      // Check if the contact's space belongs to a brokerage member
      const { data: spaceOwner } = await supabase
        .from('Space')
        .select('ownerId')
        .eq('id', contact.spaceId)
        .maybeSingle();

      if (spaceOwner) {
        const { data: membership } = await supabase
          .from('BrokerageMembership')
          .select('id')
          .eq('brokerageId', brokerage.id)
          .eq('userId', spaceOwner.ownerId)
          .maybeSingle();
        if (membership) authorized = true;
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: 'Not authorized to add notes to this contact' }, { status: 403 });
    }

    // Build the note prefix
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const prefix = `[Broker: ${brokerName} - ${dateStr}]`;
    const newNote = `${prefix} ${note}`;

    // Prepend to existing notes (newest first)
    const existingNotes = contact.notes ?? '';
    const updatedNotes = existingNotes
      ? `${newNote}\n\n${existingNotes}`
      : newNote;

    const { error: updateError } = await supabase
      .from('Contact')
      .update({
        notes: updatedNotes,
        updatedAt: now.toISOString(),
      })
      .eq('id', contactId);

    if (updateError) throw updateError;

    // If this is an assigned lead, also add the note to the realtor's copy
    if (contact.spaceId === brokerSpaceId && contact.applicationStatusNote) {
      try {
        const meta = JSON.parse(contact.applicationStatusNote);
        if (meta.assignedContactId) {
          const { data: realtorContact } = await supabase
            .from('Contact')
            .select('id, notes')
            .eq('id', meta.assignedContactId)
            .maybeSingle();

          if (realtorContact) {
            const realtorExisting = realtorContact.notes ?? '';
            const realtorUpdated = realtorExisting
              ? `${newNote}\n\n${realtorExisting}`
              : newNote;

            await supabase
              .from('Contact')
              .update({
                notes: realtorUpdated,
                updatedAt: now.toISOString(),
              })
              .eq('id', meta.assignedContactId);
          }
        }
      } catch {
        // If parsing fails, skip syncing to realtor copy
      }
    }

    return NextResponse.json({
      success: true,
      note: newNote,
      updatedNotes,
    });
  } catch (error) {
    console.error('[lead-note] error', { contactId, error });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * GET /api/broker/lead-note?contactId=xxx
 *
 * Returns the notes for a contact (broker must have access).
 */
export async function GET(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { brokerage } = ctx;

  const contactId = req.nextUrl.searchParams.get('contactId');
  if (!contactId) {
    return NextResponse.json({ error: 'contactId required' }, { status: 400 });
  }

  try {
    const { data: contact } = await supabase
      .from('Contact')
      .select('id, notes, spaceId')
      .eq('id', contactId)
      .maybeSingle();

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Verify the contact belongs to the broker's space or a brokerage member's space
    const { data: ownerSpace } = await supabase
      .from('Space')
      .select('id')
      .eq('ownerId', brokerage.ownerId)
      .maybeSingle();
    const brokerSpaceId = ownerSpace?.id ?? null;

    let authorized = false;

    if (contact.spaceId === brokerSpaceId) {
      authorized = true;
    } else {
      // Check if the contact's space belongs to a brokerage member
      const { data: spaceOwner } = await supabase
        .from('Space')
        .select('ownerId')
        .eq('id', contact.spaceId)
        .maybeSingle();

      if (spaceOwner) {
        const { data: membership } = await supabase
          .from('BrokerageMembership')
          .select('id')
          .eq('brokerageId', brokerage.id)
          .eq('userId', spaceOwner.ownerId)
          .maybeSingle();
        if (membership) authorized = true;
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: 'Not authorized to view notes for this contact' }, { status: 403 });
    }

    return NextResponse.json({ notes: contact.notes ?? '' });
  } catch (error) {
    console.error('[lead-note] GET error', { contactId, error });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
