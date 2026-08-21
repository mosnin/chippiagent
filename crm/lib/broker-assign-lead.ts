import { supabase } from '@/lib/supabase';
import { getSpaceByOwnerId } from '@/lib/space';
import { notifyNewLead } from '@/lib/notify';
import { fireAgentTrigger } from '@/lib/agent/fire-trigger';
import { casUpdate, retryOnConflict } from '@/lib/cas-write';

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

  // Claim the original row FIRST with an updatedAt CAS so two concurrent
  // assigns cannot both clone. A stale tags/notes snapshot written after
  // another writer (leads-page new-lead clear, broker note) is last-write-wins
  // data loss — retry from a fresh read instead.
  const newContactId = crypto.randomUUID();
  const claimState: {
    assignmentMeta: string;
    rollback: {
      tags: string[];
      notes: string | null;
      applicationStatus: string | null;
      applicationStatusNote: string | null;
    } | null;
  } = { assignmentMeta: '', rollback: null };

  const claim = await retryOnConflict<Record<string, unknown> & { updatedAt: string }>({
    table: 'Contact',
    id: contactId,
    readColumns: '*',
    build: (current) => {
      const existingTags: string[] = (current.tags as string[] | null) ?? [];
      if (existingTags.includes('assigned')) return { abort: 'conflict' };
      const now = new Date().toISOString();
      claimState.assignmentMeta = JSON.stringify({
        assignedTo: realtorUserId,
        assignedToName: realtorName,
        assignedContactId: newContactId,
        assignedSpaceId: realtorSpace.id,
        assignedAt: now,
      });
      claimState.rollback = {
        tags: existingTags,
        notes: (current.notes as string | null) ?? null,
        applicationStatus: (current.applicationStatus as string | null) ?? null,
        applicationStatusNote: (current.applicationStatusNote as string | null) ?? null,
      };
      const assignmentNote = [
        current.notes,
        `\nAssigned to: ${realtorName}`,
        `--- Assigned to realtor (${realtorUserId}) on ${now} by ${assignedByUserId} ---`,
      ]
        .filter(Boolean)
        .join('\n');
      return {
        patch: {
          tags: [...existingTags.filter((t: string) => t !== 'new-lead'), 'assigned'],
          notes: assignmentNote,
          applicationStatus: 'assigned',
          applicationStatusNote: claimState.assignmentMeta,
          updatedAt: now,
        },
        match: { updatedAt: current.updatedAt },
      };
    },
  });

  if (!claim.ok) {
    if (claim.reason === 'not_found') {
      return { ok: false, error: 'Contact not found in your brokerage space', status: 404 };
    }
    if (claim.reason === 'conflict') {
      return { ok: false, error: 'This lead has already been assigned', status: 409 };
    }
    throw claim.error ?? new Error('Failed to claim lead');
  }

  const claimed = claim.row;

  // ── Clone the contact into the realtor's space ─────────────────────────
  const { error: cloneError } = await supabase.from('Contact').insert({
    id: newContactId,
    spaceId: realtorSpace.id,
    name: claimed.name,
    email: claimed.email,
    phone: claimed.phone,
    budget: claimed.budget,
    preferences: claimed.preferences,
    address: claimed.address,
    notes: claimState.rollback?.notes ?? claimed.notes,
    type: claimed.type,
    properties: claimed.properties ?? [],
    tags: ['assigned-by-broker', 'new-lead'],
    scoringStatus: claimed.scoringStatus,
    leadScore: claimed.leadScore,
    scoreLabel: claimed.scoreLabel,
    scoreSummary: claimed.scoreSummary,
    scoreDetails: claimed.scoreDetails,
    sourceLabel: `brokerage: ${brokerage.name}`,
    applicationData: claimed.applicationData,
    applicationRef: claimed.applicationRef,
    applicationStatus: claimState.rollback?.applicationStatus ?? claimed.applicationStatus,
  });
  if (cloneError) {
    if (claimState.rollback && claimState.assignmentMeta) {
      await casUpdate({
        table: 'Contact',
        id: contactId,
        match: { applicationStatusNote: claimState.assignmentMeta },
        patch: {
          tags: claimState.rollback.tags,
          notes: claimState.rollback.notes,
          applicationStatus: claimState.rollback.applicationStatus,
          applicationStatusNote: claimState.rollback.applicationStatusNote,
          updatedAt: new Date().toISOString(),
        },
      });
    }
    throw cloneError;
  }

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

  // The cloned contact is a new inbound lead in the assigned realtor's
  // workspace — wake first-touch in that realtor's voice.
  try {
    await fireAgentTrigger({
      spaceId: realtorSpace.id,
      event: 'new_lead',
      contactId: newContactId,
    });
  } catch (e) {
    console.error('[assign-lead] agent trigger failed:', { newContactId, e });
  }

  return { ok: true, newContactId, assignedToSpaceId: realtorSpace.id };
}
