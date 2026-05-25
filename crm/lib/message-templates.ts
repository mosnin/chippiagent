/**
 * Message-template types + simple {{placeholder}} interpolation.
 *
 * We intentionally keep the variable language dead-simple — a realtor should
 * be able to read a template and know what it'll do. No loops, no filters.
 * Variables not found in context render as empty strings so a template with
 * an optional field doesn't produce "{{price}}" in the final message.
 */

export type MessageChannel = 'sms' | 'email' | 'note';

export interface MessageTemplate {
  id: string;
  spaceId: string;
  name: string;
  channel: MessageChannel;
  subject: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** Canonical variables every template can use. Subset is populated per call. */
export type TemplateContext = Partial<{
  contactName: string;
  contactFirstName: string;
  dealTitle: string;
  propertyAddress: string;
  tourDate: string;
  tourTime: string;
  closeDate: string;
  realtorName: string;
  businessName: string;
  nextAction: string;
}>;

/** Supported placeholders — enforced as a const so docs + render match. */
export const TEMPLATE_VARIABLES: { key: keyof TemplateContext; description: string }[] = [
  { key: 'contactName',      description: 'Full name of the contact' },
  { key: 'contactFirstName', description: 'First name only' },
  { key: 'dealTitle',        description: 'Deal title' },
  { key: 'propertyAddress',  description: 'Deal / tour property address' },
  { key: 'tourDate',         description: 'Tour date, e.g. "Sat Apr 20"' },
  { key: 'tourTime',         description: 'Tour time, e.g. "2:00 PM"' },
  { key: 'closeDate',        description: 'Expected close date' },
  { key: 'realtorName',      description: 'Your name' },
  { key: 'businessName',     description: 'Your workspace business name' },
  { key: 'nextAction',       description: 'The deal\'s next-action text' },
];

/**
 * Replace {{variable}} tokens with values from the context. Missing values
 * are replaced with the empty string so stale placeholders don't leak out.
 *
 * Tokens are case-sensitive and whitespace-tolerant, so {{ contactName }}
 * works too.
 */
export function renderTemplate(body: string, ctx: TemplateContext): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = (ctx as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : '';
  });
}

/** Parse out the set of variables actually used in a template body. */
export function extractTemplateVariables(body: string): string[] {
  const seen = new Set<string>();
  body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    seen.add(key);
    return '';
  });
  return Array.from(seen);
}
