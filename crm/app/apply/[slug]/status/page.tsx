import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { ApplicationStatusClient } from './application-status-client';
import { PublicPageMinimalShell } from '@/components/public-page-shell';

// Disable caching so status updates show immediately
export const dynamic = 'force-dynamic';

/**
 * Friendly error page shown when a portal link is invalid or expired,
 * instead of the generic Next.js 404.
 */
function PortalErrorPage({
  businessName,
  logoUrl,
  hasToken,
}: {
  businessName: string;
  logoUrl?: string | null;
  hasToken: boolean;
}) {
  return (
    <PublicPageMinimalShell logoUrl={logoUrl} businessName={businessName}>
      <div className="w-full max-w-md text-center space-y-4" role="alert">
        <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="m15 9-6 6" />
            <path d="m9 9 6 6" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-foreground">
          {hasToken ? 'Invalid or Expired Link' : 'Application Not Found'}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {hasToken
            ? 'This portal link is no longer valid. It may have expired or been replaced by a newer one. Please check your latest email from ' +
              businessName +
              ' for an updated link.'
            : 'We could not find an application with that reference number. Please double-check the link from your confirmation email.'}
        </p>
        <p className="text-xs text-muted-foreground pt-2">
          If you continue to have trouble, contact {businessName} directly for assistance.
        </p>
      </div>
    </PublicPageMinimalShell>
  );
}

export default async function ApplicationStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string; token?: string }>;
}) {
  const { slug } = await params;
  const { ref, token } = await searchParams;

  if (!ref) notFound();

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Fetch settings early so we can use them in error pages too
  const { data: settings } = await supabase
    .from('SpaceSetting')
    .select('businessName, logoUrl')
    .eq('spaceId', space.id)
    .maybeSingle();

  const businessName = settings?.businessName || space.name;

  // Build query — if token is provided, validate both ref AND token (portal mode)
  let query = supabase
    .from('Contact')
    .select(
      'id, name, email, applicationStatus, applicationStatusNote, applicationData, formConfigSnapshot, applicationRef, statusPortalToken, scoringStatus, createdAt',
    )
    .eq('applicationRef', ref)
    .eq('spaceId', space.id);

  // If token provided, enforce it must match (defense in depth)
  if (token) {
    query = query.eq('statusPortalToken', token);
  }

  const { data: contact } = await query.maybeSingle();

  // Show a helpful, branded error page instead of generic 404
  if (!contact) {
    return (
      <PortalErrorPage
        businessName={businessName}
        logoUrl={settings?.logoUrl}
        hasToken={!!token}
      />
    );
  }

  // Determine if portal mode is enabled (token matches)
  const portalMode = !!(token && contact.statusPortalToken === token);

  // Fetch status history and messages only in portal mode
  let statusHistory: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    createdAt: string;
  }[] = [];
  let messages: {
    id: string;
    senderType: string;
    content: string;
    readAt: string | null;
    createdAt: string;
  }[] = [];
  let tours: {
    id: string;
    startsAt: string;
    endsAt: string;
    propertyAddress: string | null;
    notes: string | null;
    status: string;
  }[] = [];

  if (portalMode) {
    const [historyResult, messageResult, tourResult] = await Promise.all([
      supabase
        .from('ApplicationStatusUpdate')
        .select('id, fromStatus, toStatus, note, createdAt')
        .eq('contactId', contact.id)
        .order('createdAt', { ascending: true }),
      supabase
        .from('ApplicationMessage')
        .select('id, senderType, content, readAt, createdAt')
        .eq('contactId', contact.id)
        .order('createdAt', { ascending: true }),
      supabase
        .from('Tour')
        .select('id, startsAt, endsAt, propertyAddress, notes, status')
        .eq('contactId', contact.id)
        .in('status', ['scheduled', 'confirmed', 'completed'])
        .order('startsAt', { ascending: true }),
    ]);

    statusHistory = historyResult.data ?? [];
    messages = messageResult.data ?? [];
    tours = tourResult.data ?? [];

    // Mark unread realtor messages as read
    const unreadRealtorIds = messages
      .filter((m) => m.senderType === 'realtor' && !m.readAt)
      .map((m) => m.id);
    if (unreadRealtorIds.length > 0) {
      await supabase
        .from('ApplicationMessage')
        .update({ readAt: new Date().toISOString() })
        .in('id', unreadRealtorIds);
    }
  }

  return (
    <PublicPageMinimalShell
      logoUrl={settings?.logoUrl}
      businessName={businessName}
    >
      <ApplicationStatusClient
        contact={{
          name: contact.name,
          status: contact.applicationStatus ?? 'received',
          statusNote: contact.applicationStatusNote,
          applicationRef: contact.applicationRef ?? ref,
          applicationData: contact.applicationData,
          formConfigSnapshot: contact.formConfigSnapshot,
          createdAt: contact.createdAt,
        }}
        businessName={businessName}
        portalMode={portalMode}
        statusHistory={statusHistory}
        messages={messages}
        tours={tours}
        token={portalMode ? token! : null}
        slug={slug}
      />
    </PublicPageMinimalShell>
  );
}
