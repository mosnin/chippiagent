import { supabase } from '@/lib/supabase';
import { getSpaceByOwnerId } from '@/lib/space';
import { notifyNewLead } from '@/lib/notify';

export type AssignLeadResult =
  | { ok: true; newContactId: string; assignedToSpaceId: string }
  | { ok: false; error: string; status: number };

/**
 * Assign a brokerage lead (Contact) from the broker's space into a realtor's
 * space: clone the contact, mark the original as assigned, notify the realtor.
 *
 * Shared by POST /api/broker/assign-lead and the /assign team-chat command so
 * the two can never drift. Callers MUST verify the caller is a broker who can
 * manage leads before calling this — it performs no auth of its own.
 */
export async function assignLeadToRealtor(params: {
  brokerage: { id: string; ownerId: string; name: string };
  assignedByUserId: string;
  contactId: string;
  realtorUserId: string;
}): Promise<AssignLeadResult> {
  const { brokerage, assignedByUserId, contactId, realtorUserId } = params;

  // ── Find the broker's space ────────────────────────────────────────────
  const brokerSpace = await getSpaceByOwnerId(brokerage.ownerId);
  if (!brokerSpace) {
    return { ok: false, error: 'Broker space not found', status: 500 };
  }

  // ── Verify the contact belongs to this brokerage ───────────────────────
  // Accept contacts in the broker owner's space (legacy path) OR contacts
  // where brokerageId is explicitly set (modern intake path).
  const { data: contactInSpace, error: contactError } = await supabase
    .from('Contact')
    .select('*')
    .eq('id', contactId)
    .eq('spaceId', brokerSpace.id)
    .maybeSingle();
  if (contactError) throw contactError;

  let contact = contactInSpace;
  if (!contact) {
    const { data: contactByBrokerageId, error: brokerageContactError } = await supabase
      .from('Contact')
      .select('*')
      .eq('id', contactId)
      .eq('brokerageId', brokerage.id)
      .maybeSingle();
    if (brokerageContactError) throw brokerageContactError;
    contact = contactByBrokerageId;
  }

  if (!contact) {
    return { ok: false, error: 'Contact not found in your brokerage space', status: 404 };
  }

  // ── Verify the realtor is a member of this brokerage ───────────────────
  const { data: realtorMembership, error: memberError } = await supabase
    .from('BrokerageMembership')
    .select('id, role, userId')
    .eq('brokerageId', brokerage.id)
    .eq('userId', realtorUserId)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!realtorMembership) {
    return { ok: false, error: 'User is not a member of this brokerage', status: 403 };
  }

  // ── Find the realtor's space ───────────────────────────────────────────
  const realtorSpace = await getSpaceByOwnerId(realtorUserId);
  if (!realtorSpace) {
    return { ok: false, error: 'Member does not have a workspace yet', status: 404 };
  }

  // ── Fetch the realtor's name ───────────────────────────────────────────
  const { data: realtorUser } = await supabase
    .from('User')
    .select('name, email')
    .eq('id', realtorUserId)
    .maybeSingle();
  const realtorName = realtorUser?.name ?? realtorUser?.email ?? realtorUserId;

  // ── Prevent double-assignment ──────────────────────────────────────────
  const existingTags: string[] = contact.tags ?? [];
  if (existingTags.includes('assigned')) {
    return { ok: false, error: 'This lead has already been assigned', status: 409 };
  }

  // ── Clone the contact into the realtor's space ─────────────────────────
  const newContactId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: cloneError } = await supabase.from('Contact').insert({
    id: newContactId,
    spaceId: realtorSpace.id,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    budget: contact.budget,
    preferences: contact.preferences,
    address: contact.address,
    notes: contact.notes,
    type: contact.type,
    properties: contact.properties ?? [],
    tags: ['assigned-by-broker', 'new-lead'],
    scoringStatus: contact.scoringStatus,
    leadScore: contact.leadScore,
    scoreLabel: contact.scoreLabel,
    scoreSummary: contact.scoreSummary,
    scoreDetails: contact.scoreDetails,
    sourceLabel: `brokerage: ${brokerage.name}`,
    applicationData: contact.applicationData,
    applicationRef: contact.applicationRef,
    applicationStatus: contact.applicationStatus,
  });
  if (cloneError) throw cloneError;

  // ── Mark the original contact as assigned ──────────────────────────────
  const assignmentNote = [
    contact.notes,
    `\nAssigned to: ${realtorName}`,
    `--- Assigned to realtor (${realtorUserId}) on ${now} by ${assignedByUserId} ---`,
  ]
    .filter(Boolean)
    .join('\n');

  const assignmentMeta = JSON.stringify({
    assignedTo: realtorUserId,
    assignedToName: realtorName,
    assignedContactId: newContactId,
    assignedSpaceId: realtorSpace.id,
    assignedAt: now,
  });

  const { error: updateError } = await supabase
    .from('Contact')
    .update({
      tags: [...existingTags.filter((t: string) => t !== 'new-lead'), 'assigned'],
      notes: assignmentNote,
      applicationStatus: 'assigned',
      applicationStatusNote: assignmentMeta,
      updatedAt: now,
    })
    .eq('id', contactId);
  if (updateError) throw updateError;

  console.info('[assign-lead] lead assigned', {
    contactId,
    newContactId,
    brokerageId: brokerage.id,
    realtorUserId,
    assignedBy: assignedByUserId,
  });

  // ── Notify the realtor (best-effort — never fail the assignment) ───────
  try {
    await notifyNewLead({
      spaceId: realtorSpace.id,
      contactId: newContactId,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      leadScore: contact.leadScore,
      scoreLabel: contact.scoreLabel,
      scoreSummary: contact.scoreSummary,
      applicationData: contact.applicationData,
    });
  } catch (e) {
    console.error('[assign-lead] notification failed:', { newContactId, e });
  }

  return { ok: true, newContactId, assignedToSpaceId: realtorSpace.id };
}
