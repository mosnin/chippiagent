import type { DealContactRole } from '@/lib/types';

/**
 * Canonical role catalogue for people attached to a deal. Keep the list short
 * and residential-first; commercial flows can add their own labels by picking
 * `other` + a free-form name in the contact record.
 */
export const DEAL_CONTACT_ROLES: { value: DealContactRole; label: string; group: 'principal' | 'agent' | 'service' | 'other' }[] = [
  { value: 'buyer',          label: 'Buyer',           group: 'principal' },
  { value: 'seller',         label: 'Seller',          group: 'principal' },
  { value: 'buyer_agent',    label: "Buyer's agent",   group: 'agent' },
  { value: 'listing_agent',  label: 'Listing agent',   group: 'agent' },
  { value: 'co_agent',       label: 'Co-agent',        group: 'agent' },
  { value: 'lender',         label: 'Lender',          group: 'service' },
  { value: 'title',          label: 'Title company',   group: 'service' },
  { value: 'escrow',         label: 'Escrow officer',  group: 'service' },
  { value: 'inspector',      label: 'Inspector',       group: 'service' },
  { value: 'appraiser',      label: 'Appraiser',       group: 'service' },
  { value: 'attorney',       label: 'Attorney',        group: 'service' },
  { value: 'other',          label: 'Other',           group: 'other' },
];

const BY_VALUE: Map<DealContactRole, string> = new Map(
  DEAL_CONTACT_ROLES.map((r) => [r.value, r.label] as const),
);

export function roleLabel(role: DealContactRole | null | undefined): string | null {
  if (!role) return null;
  return BY_VALUE.get(role) ?? null;
}

export function isValidRole(raw: unknown): raw is DealContactRole {
  return typeof raw === 'string' && BY_VALUE.has(raw as DealContactRole);
}
