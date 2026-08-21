import type { IntakeFormConfig, ApplicationData } from '@/lib/types';

/**
 * Public status page is reachable with only `?ref=` (old confirmation emails).
 * Next.js serializes client-component props into the RSC payload, so any
 * field we pass here is world-readable — even if the UI never renders it.
 *
 * Token-less views may show name + status. Application answers (income, DOB,
 * address, screening flags, …) stay on the server until a valid portal token
 * is present.
 */

export const PUBLIC_STATUS_CONTACT_COLUMNS =
  'id, name, applicationStatus, applicationStatusNote, applicationRef, createdAt';

export const PORTAL_STATUS_CONTACT_COLUMNS = `${PUBLIC_STATUS_CONTACT_COLUMNS}, applicationData, formConfigSnapshot`;

export function statusContactColumns(hasToken: boolean): string {
  return hasToken ? PORTAL_STATUS_CONTACT_COLUMNS : PUBLIC_STATUS_CONTACT_COLUMNS;
}

export type StatusContactRow = {
  name: string;
  applicationStatus: string | null;
  applicationStatusNote: string | null;
  applicationRef: string | null;
  applicationData?: Record<string, unknown> | ApplicationData | null;
  formConfigSnapshot?: IntakeFormConfig | null;
  createdAt: string;
};

export function toPublicStatusContact(
  contact: StatusContactRow,
  portalMode: boolean,
  fallbackRef: string,
) {
  return {
    name: contact.name,
    status: contact.applicationStatus ?? 'received',
    statusNote: contact.applicationStatusNote,
    applicationRef: contact.applicationRef ?? fallbackRef,
    applicationData: portalMode ? (contact.applicationData ?? null) : null,
    formConfigSnapshot: portalMode ? (contact.formConfigSnapshot ?? null) : null,
    createdAt: contact.createdAt,
  };
}
