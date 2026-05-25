import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { FormUnavailable } from '@/components/form-unavailable';
import { TrackingPixels } from '@/components/tracking-pixels';
import { IntakeChat } from '@/components/intake-chat/intake-chat';
import { IntakeChatShell } from '@/components/intake-chat/intake-chat-shell';
import { PreviewBridge } from './preview-bridge';
import { clerkClient } from '@clerk/nextjs/server';
import type { TrackingPixels as TrackingPixelsType } from '@/lib/types';
import type { Metadata } from 'next';

// Do not cache this page.
// Intake form customization should appear immediately after save, and stale
// cache windows can make newly added sections/questions look "missing".
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) return { title: 'Application — Chippi' };

  const { data: settings } = await supabase
    .from('SpaceSetting')
    .select('businessName')
    .eq('spaceId', space.id)
    .maybeSingle();

  const name = settings?.businessName || space.name;
  return {
    title: `${name} — Application`,
    description: `Submit your application to ${name}.`,
    openGraph: { title: `${name} — Application`, description: `Submit your application to ${name}.` },
  };
}

export default async function PublicApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ resume?: string; preview?: string }>;
}) {
  const { slug } = await params;
  // `resume` is preserved in the URL surface for backwards compatibility
  // (old emailed draft links) but the chat flow doesn't restore drafts —
  // a chat is a single session by nature.
  const { preview } = await searchParams;
  const isPreview = preview === '1';
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Parallel queries — both depend on space but run simultaneously
  // Use two queries: one for core fields (always exist), one for customization (may not exist yet)
  const [{ data: coreSettings }, { data: customSettings }, { data: ownerData }] = await Promise.all([
    supabase
      .from('SpaceSetting')
      .select('intakePageTitle, intakePageIntro, businessName, logoUrl, realtorPhotoUrl, privacyPolicyHtml')
      .eq('spaceId', space.id)
      .maybeSingle(),
    supabase
      .from('SpaceSetting')
      .select(
        'intakeAccentColor, intakeBorderRadius, intakeFont, intakeDarkMode, ' +
        'intakeHeaderBgColor, intakeHeaderGradient, intakeVideoUrl, ' +
        'intakeDisclaimerText, intakeThankYouTitle, intakeThankYouMessage, ' +
        'intakeFooterLinks, intakeDisabledSteps, intakeCustomQuestions, ' +
        'intakeFaviconUrl, bio, socialLinks, privacyPolicyUrl, consentCheckboxLabel, ' +
        'intakeLicenseNumber, intakeFairHousingNotice, intakeShowEqualHousingMark, ' +
        'formConfig, formConfigSource, rentalFormConfig, buyerFormConfig, trackingPixels'
      )
      .eq('spaceId', space.id)
      .maybeSingle()
      .then(r => r),
    supabase
      .from('User')
      .select('name, avatar, clerkId')
      .eq('id', space.ownerId)
      .maybeSingle(),
  ]);

  const settingsData = { ...((coreSettings ?? {}) as any), ...((customSettings ?? {}) as any) };
  const settings = settingsData as {
    intakePageTitle: string | null;
    intakePageIntro: string | null;
    businessName: string | null;
    logoUrl: string | null;
    realtorPhotoUrl: string | null;
    intakeAccentColor: string | null;
    intakeBorderRadius: string | null;
    intakeFont: string | null;
    intakeDarkMode: boolean | null;
    intakeHeaderBgColor: string | null;
    intakeHeaderGradient: string | null;
    intakeVideoUrl: string | null;
    intakeDisclaimerText: string | null;
    intakeThankYouTitle: string | null;
    intakeThankYouMessage: string | null;
    intakeFooterLinks: { label: string; url: string }[] | null;
    intakeDisabledSteps: number[] | null;
    intakeCustomQuestions: { id: string; label: string; type: string; required?: boolean }[] | null;
    intakeFaviconUrl: string | null;
    bio: string | null;
    socialLinks: Record<string, string> | null;
    privacyPolicyUrl: string | null;
    consentCheckboxLabel: string | null;
    intakeLicenseNumber: string | null;
    intakeFairHousingNotice: string | null;
    intakeShowEqualHousingMark: boolean | null;
    formConfig: import('@/lib/types').IntakeFormConfig | null;
    formConfigSource: string | null;
    rentalFormConfig: import('@/lib/types').IntakeFormConfig | null;
    buyerFormConfig: import('@/lib/types').IntakeFormConfig | null;
    trackingPixels: TrackingPixelsType | null;
  } | null;

  const pageTitle = settings?.intakePageTitle || 'Application';
  const pageIntro = settings?.intakePageIntro || "Share your preferences and we'll follow up with next steps.";
  const businessName = settings?.businessName || space.name;
  const agentName = ownerData?.name || businessName;

  // Get agent photo: SpaceSetting > User.avatar > Clerk profile photo
  let agentPhoto = settings?.realtorPhotoUrl || ownerData?.avatar || null;
  if (!agentPhoto && ownerData?.clerkId) {
    try {
      const clerk = await clerkClient();
      const clerkUser = await clerk.users.getUser(ownerData.clerkId);
      if (clerkUser?.imageUrl) {
        agentPhoto = clerkUser.imageUrl;
        // Backfill to DB so we don't fetch from Clerk every time
        await supabase.from('User').update({ avatar: clerkUser.imageUrl }).eq('id', space.ownerId);
      }
    } catch {
      // Clerk fetch failed — continue without photo
    }
  }
  const logoUrl = settings?.logoUrl || null;

  // Gate on subscription status — only pause forms for explicitly failed billing
  const status = space.stripeSubscriptionStatus;
  const formPaused = status === 'past_due' || status === 'canceled' || status === 'unpaid';
  if (formPaused) {
    return <FormUnavailable agentName={agentName} />;
  }

  // Hide the Chippi mark on paid tiers — visible only on the free tier as
  // a value-exchange brand exposure. The realtor pays for white-label when
  // they're on an active paid plan (or trialing into one).
  const hidePoweredBy = status === 'active' || status === 'trialing';

  // ── Resolve dynamic form configs (dual: rental + buyer) ──────────────────
  type IFC = import('@/lib/types').IntakeFormConfig;
  let resolvedFormConfig: IFC | null = null;
  let resolvedRentalFormConfig: IFC | null = null;
  let resolvedBuyerFormConfig: IFC | null = null;
  const formConfigSource = settings?.formConfigSource ?? 'legacy';

  if (formConfigSource === 'brokerage' && space.brokerageId) {
    // Fetch form configs from brokerage template
    try {
      const { data: brokerageData } = await supabase
        .from('Brokerage')
        .select('brokerageFormConfig, brokerageRentalFormConfig, brokerageBuyerFormConfig')
        .eq('id', space.brokerageId)
        .maybeSingle();
      if (brokerageData) {
        const legacySingle = (brokerageData.brokerageFormConfig ?? null) as IFC | null;
        const legacySingleLeadType = legacySingle?.leadType === 'buyer' ? 'buyer' : 'rental';

        resolvedRentalFormConfig = (brokerageData.brokerageRentalFormConfig ?? null) as IFC | null;
        resolvedBuyerFormConfig = (brokerageData.brokerageBuyerFormConfig ?? null) as IFC | null;

        // Backwards compatibility for legacy single brokerage form config:
        // route it to the correct lead type instead of always treating it as rental.
        if (!resolvedRentalFormConfig && !resolvedBuyerFormConfig && legacySingle) {
          if (legacySingleLeadType === 'buyer') {
            resolvedBuyerFormConfig = legacySingle;
          } else {
            resolvedRentalFormConfig = legacySingle;
          }
        }
        // Legacy compat
        resolvedFormConfig = legacySingle;
      }
    } catch {
      // Brokerage fetch failed — fall back to legacy form
    }
  } else if (formConfigSource === 'custom') {
    const legacySingle = settings?.formConfig ?? null;
    const legacySingleLeadType = legacySingle?.leadType === 'buyer' ? 'buyer' : 'rental';

    resolvedRentalFormConfig = settings?.rentalFormConfig ?? null;
    resolvedBuyerFormConfig = settings?.buyerFormConfig ?? null;

    // Backwards compatibility for legacy single custom form config:
    // route it by its own leadType, not always as rental.
    if (!resolvedRentalFormConfig && !resolvedBuyerFormConfig && legacySingle) {
      if (legacySingleLeadType === 'buyer') {
        resolvedBuyerFormConfig = legacySingle;
      } else {
        resolvedRentalFormConfig = legacySingle;
      }
    }
    // Legacy compat
    resolvedFormConfig = legacySingle;
  }
  // formConfigSource === 'legacy' → all resolved configs stay null → legacy form

  const customization = {
    accentColor: settings?.intakeAccentColor || '#ff964f',
    borderRadius: settings?.intakeBorderRadius || 'rounded',
    font: settings?.intakeFont || 'system',
    darkMode: settings?.intakeDarkMode || false,
    headerBgColor: settings?.intakeHeaderBgColor || null,
    headerGradient: settings?.intakeHeaderGradient || null,
    videoUrl: settings?.intakeVideoUrl || null,
    disclaimerText: settings?.intakeDisclaimerText || null,
    thankYouTitle: settings?.intakeThankYouTitle || null,
    thankYouMessage: settings?.intakeThankYouMessage || null,
    footerLinks: settings?.intakeFooterLinks || [],
    disabledSteps: settings?.intakeDisabledSteps || [],
    customQuestions: settings?.intakeCustomQuestions || [],
    faviconUrl: settings?.intakeFaviconUrl || null,
    bio: settings?.bio || null,
    socialLinks: settings?.socialLinks || null,
    privacyPolicyUrl: settings?.privacyPolicyUrl || `/apply/${slug}/privacy`,
    consentCheckboxLabel: settings?.consentCheckboxLabel || null,
  };

  const trackingPixels = settings?.trackingPixels ?? null;

  return (
    <>
      {isPreview && <PreviewBridge />}
      <TrackingPixels pixels={trackingPixels} />
      <IntakeChatShell
        agentName={agentName}
        agentPhoto={agentPhoto}
        secondaryLabel={businessName !== agentName ? businessName : null}
        accentColor={customization.accentColor}
        privacyPolicyUrl={customization.privacyPolicyUrl}
        termsUrl={`/apply/${slug}/terms`}
        hidePoweredBy={hidePoweredBy}
        footerLinks={customization.footerLinks}
        licenseNumber={settings?.intakeLicenseNumber ?? null}
        fairHousingNotice={settings?.intakeFairHousingNotice ?? null}
        showEqualHousingMark={settings?.intakeShowEqualHousingMark ?? false}
      >
        <IntakeChat
          slug={slug}
          spaceId={space.id}
          businessName={businessName}
          agentName={agentName}
          agentPhoto={agentPhoto}
          rentalFormConfig={resolvedRentalFormConfig}
          buyerFormConfig={resolvedBuyerFormConfig}
          formConfig={resolvedFormConfig}
          customization={{
            accentColor: customization.accentColor,
            thankYouTitle: customization.thankYouTitle,
            thankYouMessage: customization.thankYouMessage,
            privacyPolicyUrl: customization.privacyPolicyUrl,
          }}
        />
      </IntakeChatShell>
    </>
  );
}
