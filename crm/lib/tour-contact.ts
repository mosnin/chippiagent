/**
 * Tour guest → Contact resolution.
 *
 * Book and convert used to look up contacts with raw `ilike(email, guestEmail)`.
 * PostgreSQL ILIKE treats `_` and `%` as wildcards, and both are legal in
 * email local-parts. `jane_doe@x.com` therefore matched `jane.doe@x.com`
 * (and `a%@gmail.com` matched every address starting with `a`). The tour
 * attached to the wrong person; `tour_completed` then texted the wrong
 * contact — or, when maybeSingle() errored on multiple wildcard hits,
 * attached nobody and dropped the complete event.
 */

import { supabase } from '@/lib/supabase';

export function normalizeTourEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Escape `\`, `%`, and `_` so ILIKE is a case-insensitive exact match. */
export function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function emailsMatch(stored: string | null | undefined, guest: string): boolean {
  return normalizeTourEmail(stored ?? '') === normalizeTourEmail(guest);
}

export function pickContactIdByEmail(
  rows: Array<{ id: string; email?: string | null }>,
  email: string,
): string | null {
  const matches = rows.filter((row) => emailsMatch(row.email, email));
  return matches[0]?.id ?? null;
}

export async function findContactByEmail(
  spaceId: string,
  email: string,
): Promise<{ id: string } | null> {
  const normalized = normalizeTourEmail(email);
  if (!spaceId || !normalized) return null;

  const { data: exact, error: exactErr } = await supabase
    .from('Contact')
    .select('id, email')
    .eq('spaceId', spaceId)
    .eq('email', normalized)
    .limit(5);
  if (exactErr) throw exactErr;
  const exactId = pickContactIdByEmail(exact ?? [], normalized);
  if (exactId) return { id: exactId };

  // Legacy mixed-case rows. Escape wildcards, then re-check equality in JS
  // so a leftover `_` or `%` can never attach the wrong contact.
  const { data: fuzzy, error: fuzzyErr } = await supabase
    .from('Contact')
    .select('id, email')
    .eq('spaceId', spaceId)
    .ilike('email', escapeIlikeExact(normalized))
    .limit(10);
  if (fuzzyErr) throw fuzzyErr;
  const fuzzyId = pickContactIdByEmail(fuzzy ?? [], normalized);
  return fuzzyId ? { id: fuzzyId } : null;
}

export async function resolveOrCreateTourContact(input: {
  spaceId: string;
  name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  sourceLabel?: string;
  tags?: string[];
}): Promise<string | null> {
  const existing = await findContactByEmail(input.spaceId, input.email);
  if (existing) return existing.id;

  const newContactId = crypto.randomUUID();
  const { error: createErr } = await supabase.from('Contact').insert({
    id: newContactId,
    spaceId: input.spaceId,
    name: input.name.trim(),
    email: normalizeTourEmail(input.email),
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    type: 'TOUR',
    tags: input.tags ?? ['tour-booking'],
    sourceLabel: input.sourceLabel ?? 'tour-booking',
    scoringStatus: 'unscored',
  });
  if (!createErr) return newContactId;

  // Lost the insert race (or a uniqueness check). Re-resolve so the tour
  // still gets a contactId — a null here drops tour_completed follow-up.
  console.error('[tour-contact] Auto-create contact failed:', createErr);
  const retry = await findContactByEmail(input.spaceId, input.email);
  return retry?.id ?? null;
}
