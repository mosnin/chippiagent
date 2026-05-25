'use client';

import { useParams } from 'next/navigation';
import { ContactCard } from './contact-card';

interface ContactSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  leadType?: 'rental' | 'buyer' | null;
  scoreLabel?: string | null;
  leadScore?: number | null;
  followUpAt?: string | null;
}

interface ContactsResultData {
  contacts: ContactSummary[];
}

/**
 * Inline rendering of `search_contacts` (and `get_contact`) tool results.
 * Each contact renders as an expandable inline card — collapsed row shows
 * the essentials; click to expand for rich detail without leaving the chat.
 */
export function ContactsResult({ data }: { data: ContactsResultData }) {
  const params = useParams();
  const slug = params?.slug as string | undefined;
  const { contacts } = data;

  if (!contacts?.length) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {contacts.map((c, i) => (
        <ContactCard key={c.id} contact={c} slug={slug ?? ''} animDelay={i * 0.05} />
      ))}
    </div>
  );
}
