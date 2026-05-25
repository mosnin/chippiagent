import { Suspense } from 'react';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { Phone, Flame, Thermometer, Snowflake, HelpCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { Contact } from '@/lib/types';
import { LeadsView } from '@/components/leads/leads-view';
import { PeopleTabs } from '@/components/people/people-tabs';
import { H1, TITLE_FONT } from '@/lib/typography';

export default async function LeadsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) redirect('/');

  // Verify the authenticated user owns this space
  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || userSpace.id !== space.id) redirect('/');

  let leads: Contact[] = [];
  try {
    const { data, error } = await supabase
      .from('Contact')
      .select('*')
      .eq('spaceId', space.id)
      .is('brokerageId', null) // Exclude brokerage leads
      .contains('tags', ['application-link'])
      .order('createdAt', { ascending: false })
      .limit(500);
    if (error) throw error;
    leads = (data ?? []) as Contact[];
  } catch (err) {
    console.error('[leads] DB query failed', { slug, error: err });
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t load your leads. This is usually temporary.
          </p>
          <a
            href={`/s/${slug}/leads`}
            className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  // Mark new leads as read (clear new-lead tag). One UPDATE per row — the
  // existing tags differ between rows, so a single bulk update with one value
  // would clobber them. Still cheap at ≤500 rows. Logged loudly so a silent
  // failure mode (DB write fails, badge stays forever) gets caught.
  const unreadLeads = leads.filter((lead) => lead.tags.includes('new-lead'));
  if (unreadLeads.length) {
    try {
      await Promise.all(
        unreadLeads.map((lead) => {
          const newTags = (lead.tags ?? []).filter((t: string) => t !== 'new-lead');
          return supabase
            .from('Contact')
            .update({ tags: newTags, updatedAt: new Date().toISOString() })
            .eq('id', lead.id)
            .eq('spaceId', space.id);
        }),
      );
    } catch (err) {
      console.error('[leads] failed to clear new-lead tags', {
        spaceId: space.id,
        count: unreadLeads.length,
        error: err,
      });
    }
  }

  const newLeadIds = new Set(unreadLeads.map((l) => l.id));

  // Tier counts (server-side, for summary bar)
  const tierCounts = {
    hot: leads.filter((l) => l.scoringStatus === 'scored' && l.scoreLabel === 'hot').length,
    warm: leads.filter((l) => l.scoringStatus === 'scored' && l.scoreLabel === 'warm').length,
    cold: leads.filter((l) => l.scoringStatus === 'scored' && l.scoreLabel === 'cold').length,
    unscored: leads.filter((l) => l.scoringStatus !== 'scored' || !l.scoreLabel).length,
  };

  return (
    <div className="space-y-6 max-w-[1320px]">
      <header className="space-y-1.5">
        <p className="text-sm text-muted-foreground">People.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Applications
        </h1>
        <p className="text-sm text-muted-foreground">
          {leads.length === 0
            ? 'Share your intake link and leads will appear here.'
            : unreadLeads.length > 0
              ? `${unreadLeads.length} new since you last checked.`
              : 'All caught up — no new applications.'}
        </p>
      </header>

      <PeopleTabs slug={slug} newCount={unreadLeads.length} />

      {/* Tier summary bar */}
      {leads.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            {leads.length} {leads.length === 1 ? 'application' : 'applications'}
          </span>
          <div className="h-3 w-px bg-border hidden sm:block" />
          <div className="flex flex-wrap gap-3">
            {tierCounts.hot > 0 && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <Flame size={13} />
                {tierCounts.hot} hot
              </div>
            )}
            {tierCounts.warm > 0 && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                <Thermometer size={13} />
                {tierCounts.warm} warm
              </div>
            )}
            {tierCounts.cold > 0 && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                <Snowflake size={13} />
                {tierCounts.cold} cold
              </div>
            )}
            {tierCounts.unscored > 0 && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <HelpCircle size={13} />
                {tierCounts.unscored} unscored
              </div>
            )}
          </div>
        </div>
      )}

      {leads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
          <p className="text-sm text-foreground">No applications yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Share your intake link — new applications will appear here.
          </p>
          <Link
            href={`/s/${slug}/intake/share`}
            className="inline-flex items-center gap-1.5 mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Get your intake link <ArrowRight size={12} />
          </Link>
        </div>
      ) : (
        <Suspense fallback={<div className="text-sm text-muted-foreground py-8 text-center">Loading leads...</div>}>
          <LeadsView leads={leads} slug={slug} newLeadIds={newLeadIds} />
        </Suspense>
      )}
    </div>
  );
}
