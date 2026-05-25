import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { GeneralSettingsForm, DangerZone } from './general-settings-form';
import { ProfileSection } from './profile-section';
import { NotificationsSection } from './notifications-section';
import { LegalSettingsForm } from './legal/legal-settings-form';
import { IntakeTrustSignalsForm } from './intake-trust-signals-form';
import { IntegrationsSection } from './integrations-section';
import { ConnectedAppsSection } from '@/components/settings/connected-apps-section';
import { AIProfileForm } from '@/components/profile/ai-profile-form';
import { ChatModelPicker } from '@/components/agent/chat-model-picker';
import { MemoryFeed } from '@/components/chippi/memory-feed';
import { UsageSection } from '@/components/settings/usage-section';
import { cn } from '@/lib/utils';
import type { SpaceSetting } from '@/lib/types';
import {
  H1,
  H2,
  TITLE_FONT,
  BODY_MUTED,
  PRIMARY_PILL,
  SECTION_RHYTHM,
  READING_MAX,
} from '@/lib/typography';

/**
 * Settings — tabbed. Five buckets the realtor can hold in their head:
 *   Workspace  — name/brand/legal/danger
 *   Profile    — who you are + how Chippi knows you
 *   Memory     — what Chippi remembers about your book
 *   Notifications — what reaches your phone
 *   Apps       — Composio integrations + API keys + message templates
 *   Usage      — what Chippi has cost you (autonomous agent runs)
 *
 * Tab state is a query param (`?tab=...`) so the URL is shareable, the
 * sub-route redirects still resolve cleanly, and back-button history
 * works. Each render hydrates only the section(s) for the active tab —
 * cheaper than the old single-scroll page that hydrated all nine
 * sections every load.
 */

const TABS = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'profile', label: 'Profile' },
  { id: 'memory', label: 'Memory' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'apps', label: 'Apps' },
  { id: 'usage', label: 'Usage' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function isValidTab(v: string | undefined | null): v is TabId {
  return typeof v === 'string' && TABS.some((t) => t.id === v);
}

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    tab?: string;
    integration?: string;
    reason?: string;
    toolkit?: string;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const activeTab: TabId = isValidTab(sp.tab) ? sp.tab : 'workspace';

  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  let settings: SpaceSetting | null = null;
  try {
    const { data, error } = await supabase
      .from('SpaceSetting')
      .select('*')
      .eq('spaceId', space.id)
      .maybeSingle();
    if (error) throw error;
    settings = (data as SpaceSetting) ?? null;
  } catch (err) {
    console.error('[settings] DB query failed', err);
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center space-y-3 p-8">
          <h2 className={H2}>Something went wrong</h2>
          <p className={BODY_MUTED}>
            I couldn&apos;t load your settings. Usually temporary.
          </p>
          <a href={`/s/${slug}/settings`} className={PRIMARY_PILL}>
            Try again
          </a>
        </div>
      </div>
    );
  }

  // Subscription status drives the narration line under the H1. Same
  // narrator the old single-page version used; preserved verbatim.
  const subStatus =
    (space as { stripeSubscriptionStatus?: string }).stripeSubscriptionStatus ?? 'inactive';
  const periodEnd = (space as { stripePeriodEnd?: string }).stripePeriodEnd;
  const isTrialing = subStatus === 'trialing';
  const isActive = subStatus === 'active';

  let narration: string;
  if (isTrialing && periodEnd) {
    const days = Math.max(
      0,
      Math.ceil((new Date(periodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    );
    narration = `Trial ends in ${days} ${days === 1 ? 'day' : 'days'}.`;
  } else if (isActive && periodEnd) {
    const days = Math.max(
      0,
      Math.ceil((new Date(periodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    );
    narration = `Subscription active. Next charge in ${days} ${days === 1 ? 'day' : 'days'}.`;
  } else if (subStatus === 'inactive') {
    narration = 'No active subscription yet.';
  } else {
    narration = 'Workspace settings.';
  }

  return (
    <div className={`${SECTION_RHYTHM} ${READING_MAX}`}>
      {/* Page header */}
      <header className="space-y-1.5">
        <p className={BODY_MUTED}>Settings.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Settings
        </h1>
        <p className={BODY_MUTED}>
          {narration}
          {(isTrialing || isActive || subStatus === 'inactive') && (
            <>
              {' '}
              <a
                href={`/s/${slug}/billing`}
                className="underline underline-offset-2 text-foreground hover:text-foreground/80"
              >
                {subStatus === 'inactive' ? 'Start trial' : 'Manage billing'}
              </a>
            </>
          )}
        </p>
      </header>

      {/* Tab nav — horizontal-scroll on mobile, fits comfortably on desktop.
          Active tab uses the foreground underline rule from STYLESHEET; the
          rest stay muted. No pill chrome — paper-flat. */}
      <nav className="border-b border-border/60" aria-label="Settings sections">
        <div className="flex items-center gap-1 overflow-x-auto -mb-px scrollbar-hide">
          {TABS.map((t) => {
            const isActiveTab = t.id === activeTab;
            return (
              <Link
                key={t.id}
                href={`/s/${slug}/settings?tab=${t.id}`}
                aria-current={isActiveTab ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center px-3 py-2.5 text-sm whitespace-nowrap',
                  'border-b-2 -mb-px transition-colors duration-150',
                  isActiveTab
                    ? 'border-foreground text-foreground font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Active-tab content. Each tab is a focused stack of related sections;
          no cross-tab dependencies, so render order is just visual rhythm. */}
      {activeTab === 'workspace' && (
        <div className="space-y-12">
          <section className="space-y-5">
            <GeneralSettingsForm space={space} settings={settings} />
          </section>
          <section
            id="legal"
            className="space-y-5 pt-10 border-t border-border/60 scroll-mt-24"
          >
            <header className="space-y-1">
              <h2 className="text-base font-semibold">Legal</h2>
              <p className="text-sm text-muted-foreground">
                The privacy policy URL applicants see on your intake form.
              </p>
            </header>
            <LegalSettingsForm
              slug={space.slug}
              privacyPolicyUrl={settings?.privacyPolicyUrl ?? ''}
            />
          </section>
          <section
            id="trust-signals"
            className="space-y-5 pt-10 border-t border-border/60 scroll-mt-24"
          >
            <header className="space-y-1">
              <h2 className="text-base font-semibold">Compliance &amp; trust signals</h2>
              <p className="text-sm text-muted-foreground">
                Optional. License number, Fair Housing notice, and Equal Housing
                mark — shown in your intake-form footer.
              </p>
            </header>
            <IntakeTrustSignalsForm
              slug={space.slug}
              licenseNumber={settings?.intakeLicenseNumber ?? ''}
              fairHousingNotice={settings?.intakeFairHousingNotice ?? ''}
              showEqualHousingMark={settings?.intakeShowEqualHousingMark ?? false}
            />
          </section>
          <section className="space-y-5 pt-10 border-t border-border/60">
            <header className="space-y-1">
              <h2 className="text-base font-semibold text-destructive">Danger zone</h2>
              <p className="text-sm text-muted-foreground">
                Irreversible. Don&apos;t click these unless you mean it.
              </p>
            </header>
            <DangerZone space={space} />
          </section>
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="space-y-12">
          <section className="space-y-5">
            <header className="space-y-1">
              <h2 className="text-base font-semibold">Your profile</h2>
              <p className="text-sm text-muted-foreground">
                The face and voice your leads see on intake forms, tour
                pages, and packets.
              </p>
            </header>
            <ProfileSection slug={space.slug} />
          </section>
          <section
            id="ai-profile"
            className="space-y-5 pt-10 border-t border-border/60 scroll-mt-24"
          >
            <header className="space-y-1">
              <h2 className="text-base font-semibold">AI personalization</h2>
              <p className="text-sm text-muted-foreground">
                Tell Chippi about you so responses feel tailored, not generic.
              </p>
            </header>
            <AIProfileForm slug={slug} spaceId={space.id} />
          </section>
          <section
            id="chat-model"
            className="space-y-5 pt-10 border-t border-border/60 scroll-mt-24"
          >
            <header className="space-y-1">
              <h2 className="text-base font-semibold">Chippi&apos;s model</h2>
              <p className="text-sm text-muted-foreground">
                The model Chippi thinks with — in chat and when it works on
                its own. The default suits almost everyone; switch it only
                if you have a reason to.
              </p>
            </header>
            <ChatModelPicker />
          </section>
        </div>
      )}

      {activeTab === 'memory' && (
        <section id="memory" className="space-y-5">
          <header className="space-y-1">
            <h2 className="text-base font-semibold">What Chippi remembers</h2>
            <p className="text-sm text-muted-foreground">
              Everything I&apos;ve learned about you, your contacts, and your
              deals. Delete anything I got wrong — I&apos;ll re-learn it if
              it comes up again.
            </p>
          </header>
          <MemoryFeed slug={slug} />
        </section>
      )}

      {activeTab === 'notifications' && (
        <section id="notifications" className="space-y-5">
          <NotificationsSection slug={space.slug} />
        </section>
      )}

      {activeTab === 'apps' && (
        <div className="space-y-12">
          <section
            id="integrations"
            className="space-y-5"
          >
            <header className="space-y-1">
              <h2 className="text-base font-semibold">Connected apps</h2>
              <p className="text-sm text-muted-foreground">
                Connect Gmail, Outlook, Slack, HubSpot, and the rest so
                Chippi can act on your behalf through your own accounts.
              </p>
            </header>
            <ConnectedAppsSection
              callbackResult={
                sp.integration === 'connected' || sp.integration === 'failed'
                  ? {
                      ok: sp.integration === 'connected',
                      reason: sp.reason ?? null,
                      toolkit: sp.toolkit ?? null,
                    }
                  : null
              }
            />
          </section>
          <section
            id="api-keys"
            className="space-y-5 pt-10 border-t border-border/60 scroll-mt-24"
          >
            <header className="space-y-1">
              <h2 className="text-base font-semibold">API keys &amp; templates</h2>
              <p className="text-sm text-muted-foreground">
                MCP keys for Claude.ai and other agent surfaces, plus the
                message templates Chippi can paste from.
              </p>
            </header>
            <IntegrationsSection slug={space.slug} />
          </section>
        </div>
      )}

      {activeTab === 'usage' && (
        <section id="usage">
          <UsageSection />
        </section>
      )}
    </div>
  );
}
