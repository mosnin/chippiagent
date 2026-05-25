import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ConfigureAccountForm } from './configure-account-form';
import { getBrokerContext } from '@/lib/permissions';
import { Building2, ExternalLink, ArrowRight } from 'lucide-react';
import type { User, Space, SpaceSetting } from '@/lib/types';

export const metadata = { title: 'Configure your account — Chippi' };

type DbUser = User & {
  space: (Space & { settings: SpaceSetting | null }) | null;
};

export default async function ConfigurePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const clerkUser = await currentUser();

  let dbUser: DbUser | null = null;
  try {
    const { data: userData, error: userError } = await supabase.from('User').select('*').eq('clerkId', userId).maybeSingle();
    if (userError) throw userError;
    if (userData) {
      const u = userData as User;
      const { data: spaceData, error: spaceError } = await supabase.from('Space').select('*').eq('ownerId', u.id).limit(1).maybeSingle();
      if (spaceError) throw spaceError;
      if (spaceData) {
        const s = spaceData as Space;
        const { data: settingsData, error: settingsError } = await supabase.from('SpaceSetting').select('*').eq('spaceId', s.id).maybeSingle();
        if (settingsError) throw settingsError;
        dbUser = {
          ...u,
          space: {
            ...s,
            settings: (settingsData as SpaceSetting) ?? null,
          },
        };
      } else {
        dbUser = { ...u, space: null };
      }
    }
  } catch (err) {
    console.error('[configure] DB queries failed', err);
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">We couldn&apos;t load your data. This is usually temporary.</p>
          <a href={`/s/${slug}/configure`} className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Try again</a>
        </div>
      </div>
    );
  }

  const initialData = {
    name: dbUser?.name ?? clerkUser?.fullName ?? clerkUser?.firstName ?? '',
    email: dbUser?.email ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? '',
    phone: dbUser?.space?.settings?.phoneNumber ?? '',
    businessName: dbUser?.space?.settings?.businessName ?? '',
    slug: dbUser?.space?.slug ?? slug,
    intakePageTitle: dbUser?.space?.settings?.intakePageTitle ?? '',
    intakePageIntro: dbUser?.space?.settings?.intakePageIntro ?? '',
    notifications: dbUser?.space?.settings?.notifications ?? true,
    logoUrl: (dbUser?.space?.settings as any)?.logoUrl ?? '',
    realtorPhotoUrl: (dbUser?.space?.settings as any)?.realtorPhotoUrl ?? '',
    intakeAccentColor: dbUser?.space?.settings?.intakeAccentColor ?? '#ff964f',
    intakeBorderRadius: dbUser?.space?.settings?.intakeBorderRadius ?? 'rounded',
    intakeFont: dbUser?.space?.settings?.intakeFont ?? 'system',
    intakeFooterLinks: dbUser?.space?.settings?.intakeFooterLinks ?? [],
    bio: dbUser?.space?.settings?.bio ?? '',
    socialLinks: dbUser?.space?.settings?.socialLinks ?? { instagram: '', linkedin: '', facebook: '' },
    // Visual
    intakeHeaderBgColor: dbUser?.space?.settings?.intakeHeaderBgColor ?? '',
    intakeHeaderGradient: dbUser?.space?.settings?.intakeHeaderGradient ?? '',
    intakeDarkMode: dbUser?.space?.settings?.intakeDarkMode ?? false,
    intakeFaviconUrl: dbUser?.space?.settings?.intakeFaviconUrl ?? '',
    // Content
    intakeVideoUrl: dbUser?.space?.settings?.intakeVideoUrl ?? '',
    intakeThankYouTitle: dbUser?.space?.settings?.intakeThankYouTitle ?? '',
    intakeThankYouMessage: dbUser?.space?.settings?.intakeThankYouMessage ?? '',
    intakeConfirmationEmail: dbUser?.space?.settings?.intakeConfirmationEmail ?? '',
    intakeDisclaimerText: dbUser?.space?.settings?.intakeDisclaimerText ?? '',
    // Form fields
    intakeDisabledSteps: dbUser?.space?.settings?.intakeDisabledSteps ?? [],
    intakeCustomQuestions: dbUser?.space?.settings?.intakeCustomQuestions ?? [],
  };

  // Check broker status for the brokerage section
  let existingBrokerageName: string | null = null;
  try {
    const brokerCtx = await getBrokerContext();
    existingBrokerageName = brokerCtx?.brokerage.name ?? null;
  } catch {
    // non-blocking
  }

  return (
    <div className="space-y-6">
      <ConfigureAccountForm initialData={initialData} slug={slug} />

      {/* Brokerage section — links to dedicated page */}
      <div>
        <div className="mb-3">
          <p className="text-sm font-semibold">Brokerage</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {existingBrokerageName
              ? 'Manage your brokerage or view the broker dashboard.'
              : 'Create your own brokerage or join one with an invite code.'}
          </p>
        </div>

        {existingBrokerageName ? (
          <div className="rounded-lg border border-border bg-card px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Building2 size={15} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{existingBrokerageName}</p>
                  <p className="text-xs text-muted-foreground">Your brokerage</p>
                </div>
              </div>
              <Link href="/broker">
                <button className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted transition-colors flex-shrink-0">
                  <ExternalLink size={13} />
                  Broker dashboard
                </button>
              </Link>
            </div>
          </div>
        ) : (
          <Link href="/brokerage">
            <div className="rounded-lg border border-border bg-card px-5 py-4 hover:border-primary/40 transition-colors cursor-pointer group">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 size={15} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Set up a brokerage</p>
                    <p className="text-xs text-muted-foreground">Create a brokerage or join with a code</p>
                  </div>
                </div>
                <ArrowRight size={15} className="text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
              </div>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

