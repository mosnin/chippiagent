import { NextRequest, NextResponse } from 'next/server';
import { requireBroker, canManageLeads } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { getSpaceByOwnerId } from '@/lib/space';
import { z } from 'zod';

const unassignLeadSchema = z.object({
  contactId: z.string().uuid('Invalid contact ID'),
});

/**
 * POST /api/broker/unassign-lead
 *
 * Unassigns a previously-assigned brokerage lead, removing the cloned contact
 * from the realtor's space and marking the original broker contact as unassigned.
 * Only broker_owner and broker_admin roles can perform this action.
 *
 * Flow:
 * 1. Verify caller is a broker (owner or admin)
 * 2. Verify the contact exists in the broker's space and has 'assigned' tag
 * 3. Parse assignment metadata to find the cloned contact
 * 4. Delete cloned contact + related deals/deal-contacts from realtor's space
 * 5. Update original broker contact: remove 'assigned' tag, add 'unassigned' tag
 * 6. Log unassignment in notes
 */
export async function POST(req: NextRequest) {
  // ── Auth: require broker_owner or broker_admin ───────────────────────────
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Role check: only broker_owner and broker_admin can unassign leads ────
  if (!canManageLeads(ctx.membership.role)) {
    return NextResponse.json(
      { error: 'Only the owner or admins can unassign leads' },
      { status: 403 },
    );
  }

  const { brokerage, dbUserId } = ctx;

  // ── Parse request body ───────────────────────────────────────────────────
  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = unassignLeadSchema.safeParse(requestBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request data', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { contactId } = parsed.data;

  try {
    // ── Find the broker's space ──────────────────────────────────────────
    const brokerSpace = await getSpaceByOwnerId(brokerage.ownerId);
    if (!brokerSpace) {
      return NextResponse.json(
        { error: 'Broker space not found' },
        { status: 500 },
      );
    }

    // ── Verify the contact exists in the broker's space ──────────────────
    const { data: contact, error: contactError } = await supabase
      .from('Contact')
      .select('*')
      .eq('id', contactId)
      .eq('spaceId', brokerSpace.id)
      .maybeSingle();

    // Check the primary-space error before branching to the secondary lookup
    if (contactError) throw contactError;

    // Also check contacts with brokerageId (brokerage-level leads)
    let brokerContact = contact;
    if (!brokerContact) {
      const { data: brokerageContact, error: brokerageContactError } = await supabase
        .from('Contact')
        .select('*')
        .eq('id', contactId)
        .eq('brokerageId', brokerage.id)
        .maybeSingle();
      if (brokerageContactError) throw brokerageContactError;
      brokerContact = brokerageContact;
    }
    if (!brokerContact) {
      return NextResponse.json(
        { error: 'Contact not found in your brokerage space' },
        { status: 404 },
      );
    }

    // ── Verify the contact has 'assigned' tag ────────────────────────────
    const existingTags: string[] = brokerContact.tags ?? [];
    if (!existingTags.includes('assigned')) {
      return NextResponse.json(
        { error: 'This lead is not currently assigned' },
        { status: 409 },
      );
    }

    // ── Parse assignment metadata ────────────────────────────────────────
    type AssignmentMeta = {
      assignedTo: string;
      assignedToName: string;
      assignedContactId: string;
      assignedSpaceId: string;
      assignedAt: string;
    };

    let meta: AssignmentMeta | null = null;
    if (brokerContact.applicationStatusNote) {
      try {
        meta = JSON.parse(brokerContact.applicationStatusNote) as AssignmentMeta;
      } catch {
        // Invalid JSON — metadata is corrupted, still allow unassignment
      }
    }

    if (!meta?.assignedContactId) {
      return NextResponse.json(
        { error: 'Assignment metadata missing — cannot identify assigned contact' },
        { status: 422 },
      );
    }

    const { assignedContactId, assignedSpaceId, assignedTo, assignedToName } = meta;

    // ── Validate the assigned contact's space belongs to a brokerage member ──
    // Prevents corrupted/tampered metadata from deleting arbitrary contacts.
    if (assignedSpaceId) {
      const { data: assignedSpace } = await supabase
        .from('Space')
        .select('ownerId')
        .eq('id', assignedSpaceId)
        .maybeSingle();

      if (assignedSpace) {
        const { data: assignedMembership } = await supabase
          .from('BrokerageMembership')
          .select('id')
          .eq('brokerageId', brokerage.id)
          .eq('userId', assignedSpace.ownerId)
          .maybeSingle();

        if (!assignedMembership) {
          return NextResponse.json(
            { error: 'Assigned contact does not belong to a member of this brokerage' },
            { status: 403 },
          );
        }
      }
    }

    // ── Fetch the admin's name for audit logging ─────────────────────────
    const { data: adminUser } = await supabase
      .from('User')
      .select('name, email')
      .eq('id', dbUserId)
      .maybeSingle();
    const adminName = adminUser?.name ?? adminUser?.email ?? dbUserId;

    const realtorName = assignedToName ?? assignedTo ?? 'Unknown';

    // ── Delete cloned contact from realtor's space ───────────────────────
    // First, clean up related DealContact links and Deals
    try {
      // Find DealContact rows linked to the cloned contact
      const { data: dealContactLinks } = await supabase
        .from('DealContact')
        .select('dealId, contactId')
        .eq('contactId', assignedContactId);

      if (dealContactLinks && dealContactLinks.length > 0) {
        const dealIds = dealContactLinks.map(
          (dc: { dealId: string }) => dc.dealId,
        );

        // Delete DealContact links first (FK constraint)
        await supabase
          .from('DealContact')
          .delete()
          .eq('contactId', assignedContactId);

        // For each deal, check if it has other contacts. If not, delete the deal.
        for (const dealId of dealIds) {
          const { data: remainingLinks } = await supabase
            .from('DealContact')
            .select('id')
            .eq('dealId', dealId)
            .limit(1);

          if (!remainingLinks || remainingLinks.length === 0) {
            await supabase.from('Deal').delete().eq('id', dealId);
          }
        }
      }

      // Delete the cloned contact itself
      const { error: deleteError } = await supabase
        .from('Contact')
        .delete()
        .eq('id', assignedContactId);

      // If the realtor already deleted the contact, that's fine — don't error
      if (deleteError) {
        console.warn('[unassign-lead] could not delete cloned contact (may already be deleted)', {
          assignedContactId,
          error: deleteError,
        });
      }
    } catch (cleanupErr) {
      // If the realtor already deleted their copy, we still proceed with
      // cleaning up the broker side. Log but don't fail.
      console.warn('[unassign-lead] cleanup of realtor contact failed (may already be deleted)', {
        assignedContactId,
        cleanupErr,
      });
    }

    // ── Update broker contact: remove 'assigned', add 'unassigned' ───────
    const now = new Date().toISOString();
    const dateStr = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const unassignmentNote = [
      brokerContact.notes,
      `\nUnassigned from ${realtorName} on ${dateStr} by ${adminName}`,
    ]
      .filter(Boolean)
      .join('\n');

    const updatedTags = [
      ...existingTags.filter((t: string) => t !== 'assigned' && t !== 'new-lead'),
      'unassigned',
    ];

    const { error: updateError } = await supabase
      .from('Contact')
      .update({
        tags: updatedTags,
        notes: unassignmentNote,
        applicationStatus: 'unassigned',
        applicationStatusNote: null,
        updatedAt: now,
      })
      .eq('id', contactId);
    if (updateError) throw updateError;

    console.info('[unassign-lead] lead unassigned', {
      contactId,
      assignedContactId,
      brokerageId: brokerage.id,
      realtorName,
      unassignedBy: dbUserId,
    });

    return NextResponse.json(
      {
        success: true,
        contactId,
        unassignedFrom: realtorName,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[unassign-lead] unhandled error', {
      contactId,
      brokerageId: brokerage.id,
      error,
    });
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 });
  }
}
