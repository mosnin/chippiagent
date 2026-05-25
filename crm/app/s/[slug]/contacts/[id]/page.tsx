import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  MessageCircle,
  Calendar,
  Mic,
} from 'lucide-react';
import type { Contact, ApplicationData, LeadScoreDetails, IntakeFormConfig } from '@/lib/types';
import { ContactActivityTab } from '@/components/contacts/contact-activity-tab';
import { CopyApplicantPortalLink } from '@/components/contacts/copy-applicant-portal-link';
import { ContactFollowUpField } from '@/components/contacts/contact-follow-up-field';
import { ContactLifecycleFields } from '@/components/contacts/contact-lifecycle-fields';
import { FollowUpSuggestions } from '@/components/contacts/follow-up-suggestions';
import { StageProgression } from '@/components/contacts/stage-progression';
import { RescoreButton } from '@/components/contacts/rescore-button';
import { ApplicationStatusManager } from '@/components/contacts/application-status-manager';
import { PdfExportButton } from '@/components/contacts/pdf-export-button';
import { CollapsibleSection } from '@/components/contacts/collapsible-section';
import { DynamicApplicationDisplay } from '@/components/contacts/dynamic-application-display';
import { WhyThisScore } from '@/components/contacts/why-this-score';
import { formatCurrency } from '@/lib/formatting';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { AgentContactPanel } from '@/components/agent/agent-contact-panel';
import {
  buildPeopleDetailActions,
  type PeopleDetailAction,
  type PersonStateForActions,
} from '@/lib/people-detail-actions';

function tierBadgeClasses(label: string) {
  if (label === 'hot') return 'text-red-700 dark:text-red-400';
  if (label === 'warm') return 'text-amber-700 dark:text-amber-400';
  return 'text-muted-foreground';
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  // Middleware only requires login; ownership of /s/[slug] is enforced here.
  // Skipping this lets any logged-in realtor see any other realtor's contacts.
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || userSpace.id !== space.id) notFound();

  let contact: (Contact & { dealContacts: { deal: { id: string; title: string; address: string | null; value: number | null; status: string; priority: string; stage: { name: string; color: string } } }[]; tours: { id: string; startsAt: string; endsAt: string; status: string; propertyAddress: string | null }[] }) | null = null;
  let lastActivity: { type: string; content: string | null; createdAt: string } | null = null;
  try {
    const { data: contactData, error: contactError } = await supabase.from('Contact').select('*').eq('id', id).single();
    if (contactError && contactError.code === 'PGRST116') {
      contact = null;
    } else if (contactError) {
      throw contactError;
    } else {
      const c = contactData as Contact;
      // Defence-in-depth: verify contact belongs to this workspace
      if (c.spaceId !== space.id) notFound();
      const { data: dealRows, error: dealError } = await supabase.from('DealContact').select('Deal(id, title, address, value, status, priority, DealStage(name, color))').eq('contactId', id);
      if (dealError) throw dealError;
      const { data: tourRows } = await supabase.from('Tour').select('id, guestName, startsAt, endsAt, status, propertyAddress').eq('contactId', id).eq('spaceId', space.id).order('startsAt', { ascending: false }).limit(10);
      const { data: latest } = await supabase
        .from('ContactActivity')
        .select('type, content, createdAt')
        .eq('contactId', id)
        .eq('spaceId', space.id)
        .order('createdAt', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest) lastActivity = latest as { type: string; content: string | null; createdAt: string };
      contact = {
        ...c,
        dealContacts: ((dealRows ?? []) as unknown as { Deal: { id: string; title: string; address: string | null; value: number | null; status: string; priority: string; DealStage: { name: string; color: string } | null } }[]).map((row) => ({
          deal: {
            id: row.Deal.id,
            title: row.Deal.title,
            address: row.Deal.address,
            value: row.Deal.value,
            status: row.Deal.status ?? 'active',
            priority: row.Deal.priority ?? 'MEDIUM',
            stage: {
              name: row.Deal.DealStage?.name ?? 'Unknown',
              color: row.Deal.DealStage?.color ?? '#94a3b8',
            },
          },
        })),
        tours: (tourRows ?? []) as any[],
      };
    }
  } catch (err) {
    console.error('[contact-detail] DB query failed', { slug, id, error: err });
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">We couldn&apos;t load this person. This is usually temporary.</p>
          <a href={`/s/${slug}/contacts`} className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Back to people</a>
        </div>
      </div>
    );
  }

  if (!contact) notFound();

  const app = contact.applicationData as ApplicationData | null;
  const details = contact.scoreDetails as LeadScoreDetails | null;
  const formSnapshot = contact.formConfigSnapshot as IntakeFormConfig | null;

  const personState = derivePersonState(contact, lastActivity);
  const actions = buildPeopleDetailActions(personState);

  const hasOpenApp = !!app && (contact.applicationStatus === 'received' || contact.applicationStatus == null);
  const hasOpenDeals = contact.dealContacts.length > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Headline — name is the page. The next four lines tell the realtor
          everything they need to know in three seconds: who, how warm, how
          quiet, what just happened, what to do next. */}
      <header className="space-y-2">
        <Link
          href={`/s/${slug}/contacts`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={12} /> People
        </Link>
        <h1
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          {contact.name}
        </h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {buildStatusLine(contact, personState)}
        </p>
        {lastActivity && (
          <p className="text-sm text-muted-foreground">
            {buildLastActivityLine(lastActivity)}
          </p>
        )}
        <p className="text-base text-foreground leading-relaxed">
          {buildNextMove(contact, personState, details)}
        </p>
      </header>

      {/* Action pills — same vocabulary as the morning home's compose
          actions. State picks them; the realtor doesn't. The "Log a tour"
          pill is always present (it's a doorway, not a state-driven verb)
          and uses the same outline shape as a secondary action so it reads
          as a peer to "Schedule a tour" / "Send a check-in" without
          competing for the primary slot. */}
      <div className="flex flex-wrap gap-2">
        {actions.map((a, i) => (
          <ActionPill key={a.id} action={a} primary={i === 0} />
        ))}
        <Link
          href={`/s/${slug}/chippi/log?personId=${contact.id}`}
          className={cn(
            'inline-flex items-center gap-1.5 h-9 rounded-full px-4 text-sm transition-colors',
            'border border-border/70 bg-background text-foreground hover:bg-muted/40',
          )}
        >
          <Mic size={13} />
          Log a tour
        </Link>
      </div>

      {/* Quick contact bar — email/phone/address inline, applicant portal
          tucked in. Hairline on the page, not a card. */}
      {(contact.email || contact.phone || contact.address || (contact.applicationRef && contact.statusPortalToken)) && (
        <section className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm border-t border-border/60 pt-4">
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors min-w-0"
            >
              <Mail size={14} className="flex-shrink-0" />
              <span className="truncate max-w-[260px]">{contact.email}</span>
            </a>
          )}
          {contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Phone size={14} />
              {contact.phone}
            </a>
          )}
          {contact.address && (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground min-w-0">
              <MapPin size={14} className="flex-shrink-0" />
              <span className="truncate max-w-[260px]">{contact.address}</span>
            </span>
          )}
          {contact.applicationRef && contact.statusPortalToken && (
            <CopyApplicantPortalLink
              url={`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://my.usechippi.com'}/apply/${slug}/status?ref=${encodeURIComponent(contact.applicationRef)}&token=${encodeURIComponent(contact.statusPortalToken)}`}
            />
          )}
        </section>
      )}

      {/* Below the fold — every section is a <details>. The default-open
          rule is "open when there's something to act on." A finished
          application is collapsed; a received one is open. A deal in flight
          is open; no deals means the section doesn't render. */}

      <details className="group border-t border-border/60 pt-4">
        <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors">
          <span>Activity timeline</span>
          <span className="text-xs font-normal text-muted-foreground group-open:hidden">Show</span>
          <span className="text-xs font-normal text-muted-foreground hidden group-open:inline">Hide</span>
        </summary>
        <div className="mt-4">
          <ContactActivityTab contactId={contact.id} contactCreatedAt={String(contact.createdAt)} />
        </div>
      </details>

      <AgentContactPanel contactId={contact.id} slug={slug} contactName={contact.name} />

      {/* Score — open when scored, since "why is this person hot" is often
          the realtor's next question. Closed when no score yet. */}
      {contact.scoringStatus === 'scored' && (
        <details open className="group border-t border-border/60 pt-4">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-2 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors">
            <span className="inline-flex items-center gap-2">
              <MessageCircle size={13} className="text-orange-500 dark:text-orange-400" />
              Lead score
            </span>
            <span className="text-xs font-normal text-muted-foreground group-open:hidden">Show</span>
            <span className="text-xs font-normal text-muted-foreground hidden group-open:inline">Hide</span>
          </summary>
          <div className="mt-4 space-y-4">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span
                className="text-3xl tracking-tight text-foreground tabular-nums"
                style={{ fontFamily: 'var(--font-title)' }}
              >
                {contact.leadScore != null ? Math.round(contact.leadScore) : '—'}
              </span>
              {contact.scoreLabel && (
                <span className={cn('text-xs font-medium', tierBadgeClasses(contact.scoreLabel))}>
                  {contact.scoreLabel}
                </span>
              )}
              {details?.confidence != null && (
                <span className="text-xs text-muted-foreground">
                  {Math.round(details.confidence * 100)}% confidence
                </span>
              )}
              <div className="ml-auto">
                <RescoreButton contactId={contact.id} />
              </div>
            </div>
            {contact.scoreSummary && (
              <p className="text-sm text-muted-foreground leading-relaxed">{contact.scoreSummary}</p>
            )}
            <WhyThisScore details={details} />
          </div>
        </details>
      )}

      {(contact.scoringStatus === 'pending' ||
        contact.scoringStatus === 'failed' ||
        contact.scoringStatus === 'unscored' ||
        (contact.scoringStatus !== 'scored' && contact.scoringStatus !== 'pending')) && (
        <section className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">
              {contact.scoringStatus === 'pending' ? 'Scoring in progress.' : 'Not yet scored'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {contact.scoringStatus === 'pending'
                ? 'Refresh in a moment.'
                : contact.scoringStatus === 'failed'
                  ? 'Last scoring attempt failed.'
                  : 'Run an AI score to surface insights.'}
            </p>
          </div>
          {contact.scoringStatus !== 'pending' && <RescoreButton contactId={contact.id} />}
        </section>
      )}

      {/* Active deals — only renders when there are any. Open by default
          because if there's a deal in flight, that's relevant context. */}
      {hasOpenDeals && (
        <details open className="group border-t border-border/60 pt-4">
          <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors">
            <span>Active deals ({contact.dealContacts.length})</span>
            <span className="text-xs font-normal text-muted-foreground group-open:hidden">Show</span>
            <span className="text-xs font-normal text-muted-foreground hidden group-open:inline">Hide</span>
          </summary>
          <ul className="mt-4 divide-y divide-border/60">
            {contact.dealContacts.map(({ deal }) => (
              <li key={deal.id}>
                <Link
                  href={`/s/${slug}/deals/${deal.id}`}
                  className="flex items-center gap-3 py-3 hover:bg-muted/30 transition-colors -mx-2 px-2 rounded-md"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: deal.stage.color }}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{deal.title}</p>
                    {deal.address && (
                      <p className="text-xs text-muted-foreground truncate">{deal.address}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground hidden sm:inline">{deal.stage.name}</span>
                  {deal.value != null && (
                    <span className="text-xs font-medium text-foreground tabular-nums">{formatCurrency(deal.value)}</span>
                  )}
                  <ExternalLink size={12} className="text-muted-foreground flex-shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Application — open when received/null (needs review), closed once
          processed. The realtor's eye goes where the work is. */}
      {app && (
        <details {...(hasOpenApp ? { open: true } : {})} className="group border-t border-border/60 pt-4">
          <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors">
            <span className="inline-flex items-center gap-2">
              Application
              {app.submittedAt && (
                <span className="inline-flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
                  <Calendar size={11} />
                  {new Date(app.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </span>
            <span className="text-xs font-normal text-muted-foreground group-open:hidden">Show</span>
            <span className="text-xs font-normal text-muted-foreground hidden group-open:inline">Hide</span>
          </summary>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-end">
              <PdfExportButton contactId={contact.id} />
            </div>
            <ApplicationStatusManager
              contactId={contact.id}
              currentStatus={contact.applicationStatus ?? 'received'}
              statusNote={contact.applicationStatusNote ?? null}
            />
            {formSnapshot ? (
              <DynamicApplicationDisplay
                applicationData={app as Record<string, any>}
                formConfigSnapshot={formSnapshot}
                defaultOpen
              />
            ) : (
              <div className="divide-y divide-border/40">
                {(app.propertyAddress || app.unitType || app.targetMoveInDate || app.monthlyRent != null || app.leaseTermPreference || app.numberOfOccupants != null) && (
                  <CollapsibleSection title="Property" defaultOpen>
                    <DetailGrid>
                      {app.propertyAddress && <Detail label="Address" value={app.propertyAddress} />}
                      {app.unitType && <Detail label="Unit type" value={app.unitType} />}
                      {app.targetMoveInDate && <Detail label="Move-in date" value={app.targetMoveInDate} />}
                      {app.monthlyRent != null && <Detail label="Monthly rent" value={typeof app.monthlyRent === 'number' ? formatCurrency(app.monthlyRent) : String(app.monthlyRent)} />}
                      {app.leaseTermPreference && <Detail label="Lease term" value={app.leaseTermPreference} />}
                      {app.numberOfOccupants != null && <Detail label="Occupants" value={String(app.numberOfOccupants)} />}
                    </DetailGrid>
                  </CollapsibleSection>
                )}
              </div>
            )}
          </div>
        </details>
      )}

      {/* Pipeline — closed by default; not where the realtor's eye goes. */}
      <details className="group border-t border-border/60 pt-4">
        <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors">
          <span>Pipeline stage</span>
          <span className="text-xs font-normal text-muted-foreground group-open:hidden">Show</span>
          <span className="text-xs font-normal text-muted-foreground hidden group-open:inline">Hide</span>
        </summary>
        <div className="mt-4 overflow-x-auto pb-1">
          <div className="min-w-max">
            <StageProgression contactId={contact.id} currentType={contact.type} />
          </div>
        </div>
      </details>

      {/* Follow-up + lifecycle — at the bottom because they're edits-on-this-
          record, not the realtor's daily task. */}
      <details className="group border-t border-border/60 pt-4">
        <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors">
          <span>Follow-up &amp; lifecycle</span>
          <span className="text-xs font-normal text-muted-foreground group-open:hidden">Show</span>
          <span className="text-xs font-normal text-muted-foreground hidden group-open:inline">Hide</span>
        </summary>
        <div className="mt-4 space-y-4">
          <ContactFollowUpField
            contactId={contact.id}
            followUpAt={contact.followUpAt ? String(contact.followUpAt) : null}
            lastContactedAt={contact.lastContactedAt ? String(contact.lastContactedAt) : null}
          />
          <ContactLifecycleFields
            contactId={contact.id}
            initialReferralSource={contact.referralSource ?? null}
            initialSnoozedUntil={contact.snoozedUntil ? String(contact.snoozedUntil) : null}
          />
          <FollowUpSuggestions
            contactId={contact.id}
            scoreLabel={contact.scoreLabel}
            contactType={contact.type}
            hasTours={contact.tours.length > 0}
            hasDeals={hasOpenDeals}
            hasFollowUp={!!contact.followUpAt}
          />
        </div>
      </details>
    </div>
  );
}

// ── Action pills ────────────────────────────────────────────────────

function ActionPill({ action, primary }: { action: PeopleDetailAction; primary: boolean }) {
  // The first pill is the primary verb (foreground bg), the rest are
  // outlined. Matches the morning home's compose-vs-navigate vocabulary.
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center h-9 rounded-full px-4 text-sm transition-colors',
        primary
          ? 'border border-border/70 bg-foreground text-background hover:bg-foreground/90'
          : 'border border-border/70 bg-background text-foreground hover:bg-muted/40',
      )}
      data-intent={action.intent}
    >
      {action.label}
    </button>
  );
}

// ── Helpers ──

/** Compute days since a given timestamp. Returns null when the input is null. */
function daysSince(when: string | Date | null): number | null {
  if (!when) return null;
  const t = new Date(when).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/** Format a date relative for ≤7 days, absolute for older. One format. */
function formatDate(when: string | Date): string {
  const d = new Date(when);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days <= 7) return `${days} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function derivePersonState(
  contact: {
    scoreLabel: string | null;
    lastContactedAt: string | Date | null;
    followUpAt: string | Date | null;
    createdAt: string | Date;
    snoozedUntil: string | Date | null;
  },
  lastActivity: { createdAt: string } | null,
): PersonStateForActions {
  const recency = lastActivity?.createdAt ?? contact.lastContactedAt ?? null;
  const daysQuiet = daysSince(recency);
  const ageDays = daysSince(contact.createdAt) ?? 0;
  const scoreLabel: PersonStateForActions['scoreLabel'] =
    contact.scoreLabel === 'hot' || contact.scoreLabel === 'warm' || contact.scoreLabel === 'cold'
      ? contact.scoreLabel
      : null;
  // `archive_person` sets snoozedUntil to the far future (year 9999). Anything
  // past today reads as "archived for action-pill purposes" — the realtor
  // hasn't unsnoozed yet, so the page should stay actionless.
  const snoozeT = contact.snoozedUntil ? new Date(contact.snoozedUntil).getTime() : null;
  const isArchived = snoozeT !== null && !Number.isNaN(snoozeT) && snoozeT > Date.now();
  return {
    scoreLabel,
    daysQuiet,
    followUpAt: contact.followUpAt ? new Date(contact.followUpAt).toISOString() : null,
    isNew: ageDays <= 14,
    archivedAt: isArchived ? new Date(snoozeT!).toISOString() : null,
  };
}

/**
 * Status line under the headline: tier + score + recency. Tabular nums.
 * One sentence, calm, no exclamation. "Hot · 78 · 9 days quiet."
 */
function buildStatusLine(
  contact: { leadScore: number | null; scoreLabel: string | null; createdAt: string | Date },
  state: PersonStateForActions,
): string {
  const parts: string[] = [];
  if (state.scoreLabel) {
    const tier = state.scoreLabel.charAt(0).toUpperCase() + state.scoreLabel.slice(1);
    parts.push(contact.leadScore != null ? `${tier} · ${Math.round(contact.leadScore)}` : tier);
  } else {
    parts.push('Unscored');
  }
  if (state.daysQuiet === null) {
    parts.push('not yet contacted');
  } else if (state.daysQuiet === 0) {
    parts.push('touched today');
  } else if (state.daysQuiet === 1) {
    parts.push('1 day quiet');
  } else {
    parts.push(`${state.daysQuiet} days quiet`);
  }
  parts.push(`added ${formatDate(contact.createdAt)}`);
  return parts.join(' · ') + '.';
}

/**
 * Most-recent-activity sentence. One line, prefix the date only when it's
 * not today/yesterday. Uses ContactActivity (the manual-log table) — the
 * thing the realtor already cared enough to write down.
 */
function buildLastActivityLine(latest: { type: string; content: string | null; createdAt: string }): string {
  const verb = verbForActivity(latest.type);
  const when = formatDate(latest.createdAt);
  const snippet = latest.content?.trim().split(/\r?\n/)[0]?.slice(0, 80) ?? '';
  const tail = snippet ? ` — "${snippet}${snippet.length === 80 ? '…' : ''}"` : '';
  return `Last: ${verb} ${when}${tail}.`;
}

function verbForActivity(type: string): string {
  switch (type) {
    case 'note': return 'logged a note';
    case 'call': return 'logged a call';
    case 'email': return 'sent an email';
    case 'meeting': return 'met';
    case 'follow_up': return 'followed up';
    default: return 'activity';
  }
}

/**
 * The next-move sentence. This is the most important line on the page.
 * Prefer the AI-recommended action when it exists — it's already shaped
 * with concrete context. Otherwise infer from state.
 *
 * Never vague. "Reach out" alone is bad; pair it with the reason.
 */
function buildNextMove(
  contact: {
    email: string | null;
    phone: string | null;
    followUpAt: string | Date | null;
    applicationStatus: string | null;
    scoringStatus: string | null;
  },
  state: PersonStateForActions,
  details: LeadScoreDetails | null,
): string {
  // AI's recommendation wins when it exists. It already has the context.
  if (details?.recommendedNextAction) return details.recommendedNextAction;

  if (!contact.email && !contact.phone) {
    return 'Add a way to reach them — no email or phone on file.';
  }

  const overdue = state.followUpAt && Date.parse(state.followUpAt) < Date.now();
  if (overdue) {
    const days = daysSince(state.followUpAt) ?? 0;
    return days > 0
      ? `Follow-up was due ${days === 1 ? '1 day' : `${days} days`} ago — send a check-in.`
      : 'Follow-up is due — send a check-in.';
  }

  if (state.followUpAt) {
    const due = new Date(state.followUpAt);
    return `Follow-up due ${formatDate(due)}.`;
  }

  if (state.isNew && state.daysQuiet === null) {
    return 'New arrival — welcome them.';
  }

  if (state.scoreLabel === 'hot' && (state.daysQuiet ?? 0) >= 3) {
    return `Hot lead, quiet for ${state.daysQuiet} ${state.daysQuiet === 1 ? 'day' : 'days'} — send a check-in.`;
  }

  if (state.scoreLabel === 'cold' && (state.daysQuiet ?? 0) >= 7) {
    return `Cold and quiet for ${state.daysQuiet} days — send a check-in.`;
  }

  if (state.daysQuiet !== null && state.daysQuiet >= 7) {
    return `Quiet for ${state.daysQuiet} days — send a check-in.`;
  }

  if (contact.scoringStatus !== 'scored') {
    return 'Run an AI score to see what stands out.';
  }

  return 'No follow-up set — pick a date so they don’t go cold.';
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">{children}</div>;
}

function Detail({ label, value, span, flag }: { label: string; value: string; span?: number; flag?: boolean }) {
  return (
    <div className={span === 2 ? 'sm:col-span-2' : ''}>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-sm font-medium ${flag ? 'text-destructive' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}
