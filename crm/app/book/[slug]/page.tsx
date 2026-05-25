import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { BookingForm } from './booking-form';
import { PublicPageShell } from '@/components/public-page-shell';
import { FormUnavailable } from '@/components/form-unavailable';
import { TrackingPixels } from '@/components/tracking-pixels';
import type { TrackingPixels as TrackingPixelsType } from '@/lib/types';

export const revalidate = 60;

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const [{ data: settingsData }, { data: customSettings }, { data: ownerData }] = await Promise.all([
    supabase
      .from('SpaceSetting')
      .select('tourBookingPageTitle, tourBookingPageIntro, businessName, tourDuration, timezone, logoUrl, realtorPhotoUrl')
      .eq('spaceId', space.id)
      .maybeSingle(),
    supabase
      .from('SpaceSetting')
      .select(
        'intakeAccentColor, intakeFont, intakeDarkMode, ' +
        'intakeHeaderBgColor, intakeHeaderGradient, ' +
        'intakeFooterLinks, bio, socialLinks, trackingPixels'
      )
      .eq('spaceId', space.id)
      .maybeSingle(),
    supabase
      .from('User')
      .select('name, avatar')
      .eq('id', space.ownerId)
      .maybeSingle(),
  ]);

  const allSettings = { ...((settingsData ?? {}) as any), ...((customSettings ?? {}) as any) };
  const settings = allSettings as {
    tourBookingPageTitle: string | null;
    tourBookingPageIntro: string | null;
    businessName: string | null;
    tourDuration: number | null;
    timezone: string | null;
    logoUrl: string | null;
    realtorPhotoUrl: string | null;
    intakeAccentColor: string | null;
    intakeFont: string | null;
    intakeDarkMode: boolean | null;
    intakeHeaderBgColor: string | null;
    intakeHeaderGradient: string | null;
    intakeFooterLinks: { label: string; url: string }[] | null;
    bio: string | null;
    socialLinks: Record<string, string> | null;
    trackingPixels: TrackingPixelsType | null;
  } | null;

  const pageTitle = settings?.tourBookingPageTitle || 'Book a Tour';
  const pageIntro = settings?.tourBookingPageIntro || 'Pick a time that works for you and we\'ll confirm your tour.';
  const businessName = settings?.businessName || space.name;
  const duration = settings?.tourDuration || 30;
  const timezone = settings?.timezone || 'America/New_York';
  const agentName = ownerData?.name || businessName;
  const agentPhoto = settings?.realtorPhotoUrl || ownerData?.avatar || null;
  const logoUrl = settings?.logoUrl || null;

  // Gate on subscription status — only pause forms for explicitly failed billing
  const subStatus = space.stripeSubscriptionStatus;
  const formPaused = subStatus === 'past_due' || subStatus === 'canceled' || subStatus === 'unpaid';
  if (formPaused) {
    return <FormUnavailable agentName={agentName} />;
  }

  // Hide the Chippi mark on paid tiers — visible only on the free tier as
  // a value-exchange brand exposure. The realtor pays for white-label when
  // they're on an active paid plan (or trialing into one).
  const hidePoweredBy = subStatus === 'active' || subStatus === 'trialing';

  const customization = {
    accentColor: settings?.intakeAccentColor || '#ff964f',
    font: settings?.intakeFont || 'system',
    darkMode: settings?.intakeDarkMode || false,
    headerBgColor: settings?.intakeHeaderBgColor || null,
    headerGradient: settings?.intakeHeaderGradient || null,
    footerLinks: settings?.intakeFooterLinks || [],
    bio: settings?.bio || null,
    socialLinks: settings?.socialLinks || null,
  };

  const trackingPixels = settings?.trackingPixels ?? null;

  return (
    <>
      <TrackingPixels pixels={trackingPixels} />
      <PublicPageShell
        logoUrl={logoUrl}
        businessName={businessName}
        agentName={agentName}
        agentPhone={null}
        agentPhoto={agentPhoto}
        pageTitle={pageTitle}
        pageIntro={pageIntro}
        trustLine={`Your information is shared only with ${agentName} and used solely for scheduling.`}
        agentPresenceLabel="Booking with"
        hidePoweredBy={hidePoweredBy}
        customization={customization}
      >
        <BookingForm slug={slug} duration={duration} businessName={businessName} timezone={timezone} accentColor={customization.accentColor} />
      </PublicPageShell>
    </>
  );
}
