import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Mic } from 'lucide-react';
import type { DealStage, DealActivity, DealMilestone } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatCompact } from '@/lib/formatting';
import { DealDetailClient } from '@/components/deals/deal-detail-client';
import { DealInlineField } from '@/components/deals/deal-inline-field';
import { DealFollowUpField } from '@/components/deals/deal-follow-up-field';
import { DealStatusControl } from '@/components/deals/deal-status-control';
import { DealStageSelector } from '@/components/deals/deal-stage-selector';
import { DealContactsManager } from '@/components/deals/deal-contacts-manager';
import { DealMilestones } from '@/components/deals/deal-milestones';
import { DealChecklist } from '@/components/deals/deal-checklist';
import { DealCloseDateField } from '@/components/deals/deal-close-date-field';
import { DealCommissionSplits } from '@/components/deals/deal-commission-splits';
import { DealDocuments } from '@/components/deals/deal-documents';
import { DealNextActionField } from '@/components/deals/deal-next-action-field';
import { DealPropertyPicker } from '@/components/deals/deal-property-picker';
import { DealPrioritySelector } from '@/components/deals/deal-priority-selector';
import { DeleteDealButton } from '@/components/deals/deal-delete-button';
import { FlagForReviewButton } from '@/components/deals/flag-for-review-button';
import { AgentDealPanel } from '@/components/agent/agent-deal-panel';
import type { DealChecklistItem } from '@/lib/deals/checklist';
import type { DealDocument } from '@/lib/deals/documents';
import type { Property } from '@/lib/types';


export default async function DealDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug, id } = await params;
  const { tab } = await searchParams;
  const activeTab = tab === 'activity' || tab === 'checklist' || tab === 'documents' || tab === 'milestones' ? tab : 'overview';

  // Middleware only requires login; ownership of /s/[slug] is enforced here.
  // Without this, a logged-in realtor could read another realtor's deal data
  // (value, GCI, address, contacts, activities) by guessing the URL.
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || userSpace.id !== space.id) notFound();

  let dealRow: Record<string, unknown>;
  let dealContacts: { dealId: string; contactId: string; role: string | null; contact: { id: string; name: string; email: string | null; phone: string | null } | null }[];
  let activities: DealActivity[];
  let allStages: DealStage[];
  let checklist: DealChecklistItem[];
  let documents: DealDocument[];
  let linkedProperty: Property | null = null;
  let hasOpenReview = false;

  try {
    const { data: dealData, error: dealError } = await supabase
      .from('Deal')
      .select('*')
      .eq('id', id)
      .eq('spaceId', space.id)
      .maybeSingle();

    if (dealError) throw dealError;
    if (!dealData) notFound();
    dealRow = dealData as Record<string, unknown>;

    const [stagesResult, dcResult, activityResult, checklistResult, docsResult] = await Promise.all([
      supabase.from('DealStage').select('*').eq('spaceId', space.id).order('position'),
      supabase.from('DealContact').select('dealId, contactId, role, Contact(id, name, type, email, phone)').eq('dealId', id),
      supabase.from('DealActivity').select('*').eq('dealId', id).eq('spaceId', space.id).order('createdAt', { ascending: false }).limit(100),
      supabase.from('DealChecklistItem').select('*').eq('dealId', id).eq('spaceId', space.id).order('position', { ascending: true }),
      supabase.from('DealDocument').select('*').eq('dealId', id).eq('spaceId', space.id).order('createdAt', { ascending: false }),
    ]);

    if (stagesResult.error) throw stagesResult.error;
    if (dcResult.error) throw dcResult.error;
    if (activityResult.error) throw activityResult.error;
    if (checklistResult.error) throw checklistResult.error;
    if (docsResult.error) throw docsResult.error;

    allStages = (stagesResult.data ?? []) as DealStage[];
    checklist = (checklistResult.data ?? []) as DealChecklistItem[];
    documents = (docsResult.data ?? []) as DealDocument[];

    // Load the linked Property, if any. Kept as a small separate fetch so we
    // don't join here — Property rows can be referenced from multiple deals.
    const linkedPropertyId = (dealRow.propertyId as string | null | undefined) ?? null;
    if (linkedPropertyId) {
      const { data: propData } = await supabase
        .from('Property')
        .select('*')
        .eq('id', linkedPropertyId)
        .eq('spaceId', space.id)
        .maybeSingle();
      linkedProperty = (propData as Property | null) ?? null;
    }
    // Lookup whether this deal already has an open broker review request.
    // Only meaningful when the space is in a brokerage; we still issue the
    // query unconditionally (it's a single indexed lookup) so the UI below
    // stays simple, and we swallow errors so an as-yet-unapplied migration
    // on another branch doesn't break the page.
    if (space.brokerageId) {
      try {
        const { data: openReview } = await supabase
          .from('DealReviewRequest')
          .select('id')
          .eq('dealId', id)
          .eq('status', 'open')
          .maybeSingle();
        hasOpenReview = !!openReview;
      } catch (reviewErr) {
        console.warn('[deal-detail] review-request lookup failed (ignored)', reviewErr);
        hasOpenReview = false;
      }
    }

    dealContacts = ((dcResult.data ?? []) as Record<string, unknown>[]).map((row) => {
      const contact = row.Contact as { id: string; name: string; type: string; email: string | null; phone: string | null } | null;
      return {
        dealId: row.dealId as string,
        contactId: row.contactId as string,
        role: (row.role as string | null) ?? null,
        contact: contact
          ? { id: contact.id, name: contact.name, email: contact.email ?? null, phone: contact.phone ?? null }
          : null,
      };
    });
    activities = (activityResult.data ?? []) as DealActivity[];
  } catch (err) {
    console.error('[deal-detail] DB queries failed', err);
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">We couldn&apos;t load your data. This is usually temporary.</p>
          <a
            href={`/s/${slug}/deals/${id}`}
            className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  const title = dealRow.title as string;
  const stageId = dealRow.stageId as string;
  const status = (dealRow.status ?? 'active') as 'active' | 'won' | 'lost' | 'on_hold';
  const priority = (dealRow.priority ?? 'MEDIUM') as 'LOW' | 'MEDIUM' | 'HIGH';
  const value = dealRow.value != null ? (dealRow.value as number) : null;
  const commissionRate = dealRow.commissionRate != null ? (dealRow.commissionRate as number) : null;
  const probability = dealRow.probability != null ? (dealRow.probability as number) : null;
  const closeDate = dealRow.closeDate != null ? (dealRow.closeDate as string) : null;
  const followUpAt = dealRow.followUpAt != null ? (dealRow.followUpAt as string) : null;
  const address = dealRow.address != null ? (dealRow.address as string) : null;
  const description = dealRow.description != null ? (dealRow.description as string) : null;
  const nextAction = dealRow.nextAction != null ? (dealRow.nextAction as string) : null;
  const nextActionDueAt = dealRow.nextActionDueAt != null ? (dealRow.nextActionDueAt as string) : null;
  const milestones = (dealRow.milestones ?? []) as DealMilestone[];
  const createdAt = dealRow.createdAt as string;
  const updatedAt = dealRow.updatedAt as string;

  const linkedContacts = dealContacts
    .filter((dc) => dc.contact !== null)
    .map((dc) => ({ ...dc.contact!, role: dc.role as import('@/lib/types').DealContactRole | null }));

  const pipelineType = allStages.find((s) => s.id === stageId)?.pipelineType ?? null;

  return (
    <div className="space-y-0">
      {/* Back nav */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-muted-foreground">
          <Link href={`/s/${slug}/deals`}>
            <ArrowLeft size={16} />
          </Link>
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href={`/s/${slug}/deals`} className="hover:text-foreground transition-colors">
            Pipeline
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium truncate max-w-xs">{title}</span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Header bar with title + actions */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-4">
          <h1 className="text-base font-semibold truncate">{title}</h1>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Log a tour — the post-tour record moment, one click away from
                the deal it'll land on. Outline chip, same shape as
                FlagForReview so the row reads as one toolbar. The page works
                fine without it; with the dealId pre-fill, the recorder biases
                the proposal model toward this deal. */}
            <Link
              href={`/s/${slug}/chippi/log?dealId=${id}`}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border border-border bg-background',
                'px-2.5 h-8 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors',
              )}
              title="Record a quick post-tour debrief"
            >
              <Mic size={13} />
              Log a tour
            </Link>
            <FlagForReviewButton
              dealId={id}
              hasOpenReview={hasOpenReview}
              visible={!!space.brokerageId}
            />
            <DeleteDealButton dealId={id} slug={slug} dealTitle={title} />
          </div>
        </div>

        {/* Sidebar + main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">

          {/* LEFT SIDEBAR */}
          <aside className="border-b lg:border-b-0 lg:border-r border-border p-5 space-y-5">

            {/* Stage indicator */}
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Stage</p>
              <DealStageSelector dealId={id} initialStageId={stageId} stages={allStages} />
            </div>

            {/* Status */}
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Status</p>
              <DealStatusControl dealId={id} initialStatus={status} />
            </div>

            {/* Priority */}
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Priority</p>
              <DealPrioritySelector dealId={id} initialPriority={priority} />
            </div>

            {/* Follow-up */}
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Follow-up</p>
              <DealFollowUpField dealId={id} followUpAt={followUpAt} status={status} />
            </div>

            {/* Value */}
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Deal Value</p>
              <DealInlineField
                dealId={id}
                field="value"
                value={value}
                type="number"
                label="Deal Value"
                prefix="$"
                displayValue={value != null ? `$${value.toLocaleString()}` : ''}
                placeholder="Not set"
                min={0}
                step={1000}
              />
            </div>

            {/* Commission Rate */}
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Commission Rate</p>
              <DealInlineField
                dealId={id}
                field="commissionRate"
                value={commissionRate}
                type="number"
                label="Commission Rate"
                suffix="%"
                placeholder="Not set"
                min={0}
                max={100}
                step={0.1}
              />
              {value != null && commissionRate != null && (
                <p className="text-xs text-muted-foreground mt-1">
                  GCI: {formatCompact((value * commissionRate) / 100)}
                </p>
              )}
            </div>

            {/* Probability */}
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Close Probability</p>
              <DealInlineField
                dealId={id}
                field="probability"
                value={probability}
                type="number"
                label="Probability"
                suffix="%"
                placeholder="Not set"
                min={0}
                max={100}
                step={1}
              />
            </div>

            {/* Close Date */}
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Expected Close</p>
              <DealCloseDateField dealId={id} initial={closeDate} />
            </div>

            {/* Property link */}
            <DealPropertyPicker dealId={id} slug={slug} initial={linkedProperty} />

            {/* People */}
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">People</p>
              <DealContactsManager dealId={id} slug={slug} initialContacts={linkedContacts} />
            </div>

            {/* Timestamps */}
            <div className="pt-2 border-t border-border space-y-1">
              <p className="text-[11px] text-muted-foreground">
                Created{' '}
                {new Date(createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Updated{' '}
                {new Date(updatedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
          </aside>

          {/* RIGHT MAIN — URL-driven tabs */}
          <main className="p-5 min-h-[400px]">
            {/* Tab nav */}
            <div className="flex gap-0 border-b border-border mb-5 -mx-5 px-5">
              {(
                [
                  ['overview', 'Overview'],
                  ['checklist', 'Closing checklist'],
                  ['documents', 'Documents'],
                  ['activity', 'Activity'],
                ] as [string, string][]
              ).map(([key, label]) => (
                <Link
                  key={key}
                  href={`/s/${slug}/deals/${id}?tab=${key}`}
                  className={cn(
                    'px-3 pb-3 text-sm font-medium border-b-2 transition-colors mr-1',
                    activeTab === key
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === 'overview' && (
              <div className="space-y-5">
                <DealNextActionField
                  dealId={id}
                  initialAction={nextAction}
                  initialDueAt={nextActionDueAt}
                />
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Title</p>
                  <DealInlineField
                    dealId={id}
                    field="title"
                    value={title}
                    type="text"
                    label="Title"
                    placeholder="Deal title"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Address</p>
                  <DealInlineField
                    dealId={id}
                    field="address"
                    value={address}
                    type="text"
                    label="Address"
                    placeholder="Not set"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Notes</p>
                  <DealInlineField
                    dealId={id}
                    field="description"
                    value={description}
                    type="textarea"
                    label="Notes"
                    placeholder="Add notes or description…"
                  />
                </div>
                <DealCommissionSplits
                  dealId={id}
                  dealValue={value}
                  dealCommissionRate={commissionRate}
                />
                <AgentDealPanel dealId={id} slug={slug} dealTitle={title} />
              </div>
            )}

            {activeTab === 'activity' && (
              <DealDetailClient
                dealId={id}
                slug={slug}
                initialActivities={activities}
              />
            )}

            {activeTab === 'checklist' && (
              <DealChecklist dealId={id} initial={checklist} />
            )}

            {activeTab === 'documents' && (
              <DealDocuments dealId={id} initial={documents} pipelineType={pipelineType} />
            )}

            {/* Legacy milestones tab kept reachable via explicit ?tab=milestones
                for any pre-existing bookmarks; no longer in the tab bar. */}
            {activeTab === 'milestones' && (
              <DealMilestones dealId={id} initialMilestones={milestones} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
