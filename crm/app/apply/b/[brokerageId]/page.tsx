import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { FormUnavailable } from '@/components/form-unavailable';
import { IntakeChat } from '@/components/intake-chat/intake-chat';
import { IntakeChatShell } from '@/components/intake-chat/intake-chat-shell';
import type { IntakeFormConfig } from '@/lib/types';
import type { Metadata } from 'next';

// Cache this page for 60 seconds — it's public and rarely changes.
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ brokerageId: string }> }): Promise<Metadata> {
  const { brokerageId } = await params;
  const { data: brokerage } = await supabase
    .from('Brokerage')
    .select('name')
    .eq('id', brokerageId)
    .maybeSingle();

  const name = brokerage?.name || 'Application';
  return {
    title: `${name} — Application`,
    description: `Submit your application to ${name}.`,
    openGraph: { title: `${name} — Application`, description: `Submit your application to ${name}.` },
  };
}

export default async function BrokerageApplyPage({
  params,
}: {
  params: Promise<{ brokerageId: string }>;
}) {
  const { brokerageId } = await params;

  // 1. Look up the brokerage
  const { data: brokerage } = await supabase
    .from('Brokerage')
    .select(
      'id, name, status, logoUrl, ' +
      'brokerageLicenseNumber, brokerageFairHousingNotice, brokerageShowEqualHousingMark'
    )
    .eq('id', brokerageId)
    .maybeSingle<{
      id: string;
      name: string;
      status: 'active' | 'suspended';
      logoUrl: string | null;
      brokerageLicenseNumber: string | null;
      brokerageFairHousingNotice: string | null;
      brokerageShowEqualHousingMark: boolean | null;
    }>();

  if (!brokerage || brokerage.status === 'suspended') notFound();

  // 2. Find the broker_owner via BrokerageMembership
  const { data: ownerMembership } = await supabase
    .from('BrokerageMembership')
    .select('userId')
    .eq('brokerageId', brokerage.id)
    .eq('role', 'broker_owner')
    .maybeSingle();

  if (!ownerMembership) notFound();

  // 3. Get the brokerage-linked owner Space for branding.
  // For legacy data (missing Space.brokerageId), fall back only when the
  // owner has exactly one space.
  const { data: linkedSpace } = await supabase
    .from('Space')
    .select('id, slug, name, ownerId, stripeSubscriptionStatus')
    .eq('ownerId', ownerMembership.userId)
    .eq('brokerageId', brokerage.id)
    .maybeSingle();

  let space = linkedSpace;
  if (!space) {
    const { data: ownerSpaces } = await supabase
      .from('Space')
      .select('id, slug, name, ownerId, stripeSubscriptionStatus')
      .eq('ownerId', ownerMembership.userId)
      .order('createdAt', { ascending: true })
      .limit(2);
    const fallbackSpace = ownerSpaces?.[0] ?? null;
    if ((ownerSpaces ?? []).length === 1 && fallbackSpace) {
      space = fallbackSpace;
    }
  }

  if (!space) notFound();

  // 4. Load brokerage-level form configs so leads applying via the
  //    brokerage URL see the brokerage's customized intake (or the
  //    library defaults if the brokerage hasn't customized). IntakeChat
  //    falls back to library defaults when all three are null.
  const { data: brokerageConfigs } = await supabase
    .from('Brokerage')
    .select('brokerageFormConfig, brokerageRentalFormConfig, brokerageBuyerFormConfig')
    .eq('id', brokerage.id)
    .maybeSingle();

  const legacySingle = (brokerageConfigs?.brokerageFormConfig ?? null) as IntakeFormConfig | null;
  let resolvedRentalFormConfig =
    (brokerageConfigs?.brokerageRentalFormConfig ?? null) as IntakeFormConfig | null;
  let resolvedBuyerFormConfig =
    (brokerageConfigs?.brokerageBuyerFormConfig ?? null) as IntakeFormConfig | null;
  // Legacy single-config brokerages: route the config to the matching
  // leadType slot. Same compat logic /apply/[slug] uses.
  if (!resolvedRentalFormConfig && !resolvedBuyerFormConfig && legacySingle) {
    if (legacySingle.leadType === 'buyer') {
      resolvedBuyerFormConfig = legacySingle;
    } else {
      resolvedRentalFormConfig = legacySingle;
    }
  }

  // 5. Parallel queries for settings and owner info
  const [{ data: coreSettings }, { data: customSettings }, { data: ownerData }] = await Promise.all([
    supabase
      .from('SpaceSetting')
      .select('intakePageTitle, intakePageIntro, businessName, logoUrl, realtorPhotoUrl')
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
        'intakeLicenseNumber, intakeFairHousingNotice, intakeShowEqualHousingMark'
      )
      .eq('spaceId', space.id)
      .maybeSingle()
      .then(r => r),
    supabase
      .from('User')
      .select('name, avatar')
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
  } | null;

  // Use brokerage name for title, fall back to space settings
  const pageTitle = `${brokerage.name} Application`;
  const pageIntro = settings?.intakePageIntro || "Share your preferences and we'll follow up with next steps.";
  const businessName = brokerage.name;
  const agentName = brokerage.name;
  // For brokerage forms, only show the logo — no circular avatar photo
  const agentPhoto = null;
  const logoUrl = brokerage.logoUrl || settings?.logoUrl || null;

  // Gate on subscription status — only pause forms for explicitly failed billing
  const status = (space as any).stripeSubscriptionStatus as string | undefined;
  const formPaused = status === 'past_due' || status === 'canceled' || status === 'unpaid';
  if (formPaused) {
    return <FormUnavailable agentName={agentName} />;
  }

  // Hide the Chippi mark on paid tiers — visible only on the free tier as
  // a value-exchange brand exposure. The brokerage owner pays for white-label
  // when their linked space is on an active paid plan (or trialing into one).
  const hidePoweredBy = status === 'active' || status === 'trialing';

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
    bio: null, // Don't show owner's personal bio on brokerage forms
    socialLinks: settings?.socialLinks || null,
    privacyPolicyUrl: settings?.privacyPolicyUrl || `/apply/${(space as any).slug}/privacy`,
    consentCheckboxLabel: settings?.consentCheckboxLabel || null,
  };

  return (
    <IntakeChatShell
      agentName={agentName}
      agentPhoto={agentPhoto}
      secondaryLabel={null}
      accentColor={customization.accentColor}
      privacyPolicyUrl={customization.privacyPolicyUrl}
      hidePoweredBy={hidePoweredBy}
      footerLinks={customization.footerLinks}
      licenseNumber={brokerage.brokerageLicenseNumber ?? settings?.intakeLicenseNumber ?? null}
      fairHousingNotice={brokerage.brokerageFairHousingNotice ?? settings?.intakeFairHousingNotice ?? null}
      showEqualHousingMark={brokerage.brokerageShowEqualHousingMark ?? settings?.intakeShowEqualHousingMark ?? false}
    >
      <IntakeChat
        slug={space.slug}
        spaceId={space.id}
        businessName={businessName}
        agentName={agentName}
        agentPhoto={agentPhoto}
        brokerageId={brokerage.id}
        rentalFormConfig={resolvedRentalFormConfig}
        buyerFormConfig={resolvedBuyerFormConfig}
        formConfig={legacySingle}
        customization={{
          accentColor: customization.accentColor,
          thankYouTitle: customization.thankYouTitle,
          thankYouMessage: customization.thankYouMessage,
          privacyPolicyUrl: customization.privacyPolicyUrl,
        }}
      />
    </IntakeChatShell>
  );
}
