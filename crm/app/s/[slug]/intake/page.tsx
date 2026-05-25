import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { buildIntakeUrl } from '@/lib/intake';
import { IntakeLinkRow } from './intake-link-row';
import { timeAgo } from '@/lib/formatting';
import { ArrowRight, MessageCircle } from 'lucide-react';
import {
  H1,
  H3,
  TITLE_FONT,
  BODY_MUTED,
  PAGE_RHYTHM,
} from '@/lib/typography';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Intake -- ${slug} -- Chippi` };
}

export default async function IntakeOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  let totalSubmissions = 0;
  let hotLeadCount = 0;
  let recentLeads: {
    id: string;
    name: string;
    createdAt: Date;
    tags: string[];
    leadScore: number | null;
    scoreLabel: string | null;
    leadType: string | null;
  }[] = [];

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [submissionsResult, hotLeadsResult, recentResult] = await Promise.all([
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .eq('spaceId', space.id)
        .is('brokerageId', null)
        .contains('tags', ['application-link'])
        .gte('createdAt', sevenDaysAgo.toISOString()),
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .eq('spaceId', space.id)
        .is('brokerageId', null)
        .contains('tags', ['application-link'])
        .gte('createdAt', sevenDaysAgo.toISOString())
        .eq('scoreLabel', 'hot'),
      supabase
        .from('Contact')
        .select('id, name, createdAt, tags, leadScore, scoreLabel, leadType')
        .eq('spaceId', space.id)
        .is('brokerageId', null)
        .contains('tags', ['application-link'])
        .order('createdAt', { ascending: false })
        .limit(5),
    ]);

    totalSubmissions = submissionsResult.count ?? 0;
    hotLeadCount = hotLeadsResult.count ?? 0;
    recentLeads = (recentResult.data ?? []) as typeof recentLeads;
  } catch (err) {
    console.error('[intake/overview] DB query failed', err);
  }

  const intakeUrl = buildIntakeUrl(space.slug);
  const intakePath = `/apply/${space.slug}`;
  const chatUrl = `${intakeUrl}/chat`;
  const chatPath = `${intakePath}/chat`;

  // Chippi narration ladder — one sentence describing the state of intake
  // right now. No counts in stat tiles; the count lives in the sentence so
  // the realtor reads it like a thought, not a dashboard.
  const subtitle = (() => {
    if (totalSubmissions === 0) {
      return 'No submissions yet. Share the link.';
    }
    if (hotLeadCount > 0) {
      const hot = hotLeadCount === 1 ? '1 was hot' : `${hotLeadCount} were hot`;
      const subs =
        totalSubmissions === 1
          ? '1 submission this week.'
          : `${totalSubmissions} submissions this week.`;
      return `${subs} ${hot}.`;
    }
    return totalSubmissions === 1
      ? '1 submission this week.'
      : `${totalSubmissions} submissions this week.`;
  })();

  return (
    <div className={`${PAGE_RHYTHM} max-w-[880px]`}>
      {/* Header — H1 + Chippi narration */}
      <header className="space-y-1.5">
        <h1 className={H1} style={TITLE_FONT}>
          Intake
        </h1>
        <p className={BODY_MUTED}>{subtitle}</p>
      </header>

      {/* Your link — the one thing every realtor comes here for */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className={H3}>Your link</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Share it. Submissions land in People.
            </p>
          </div>
          <Link
            href={`/s/${slug}/intake/customize`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
          >
            Customize
            <ArrowRight size={13} strokeWidth={1.75} />
          </Link>
        </div>
        <IntakeLinkRow url={intakeUrl} previewHref={intakePath} />
      </section>

      {/* AI chat mode — informational, near the share link */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <MessageCircle size={13} className="text-muted-foreground/70" />
          <h2 className={H3}>AI chat mode</h2>
          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-foreground/[0.06] text-muted-foreground font-medium">
            New
          </span>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Applicants can apply via a conversational AI chatbot instead of the traditional form.
        </p>
        <IntakeLinkRow url={chatUrl} previewHref={chatPath} />
      </section>

      {/* Recent submissions — the second thing they come here for */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className={H3}>Recent</h2>
          {recentLeads.length > 0 && (
            <Link
              href={`/s/${slug}/contacts`}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 inline-flex items-center gap-1"
            >
              All in People
              <ArrowRight size={12} strokeWidth={1.75} />
            </Link>
          )}
        </div>

        {recentLeads.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            They&apos;ll show up here the moment someone fills it out.
          </p>
        ) : (
          <StaggerList className="rounded-xl border border-border/70 bg-background overflow-hidden divide-y divide-border/70">
            {recentLeads.map((lead) => {
              const isNew = lead.tags.includes('new-lead');
              const scoreLabel = lead.scoreLabel
                ? lead.scoreLabel.charAt(0).toUpperCase() + lead.scoreLabel.slice(1)
                : null;
              const typeLabel =
                lead.leadType === 'buyer'
                  ? 'Buyer'
                  : lead.leadType === 'rental'
                    ? 'Rental'
                    : null;
              const initials =
                lead.name
                  ?.split(' ')
                  ?.map((n: string) => n?.[0])
                  ?.join('')
                  ?.toUpperCase()
                  ?.slice(0, 2) || '??';
              return (
                <StaggerItem key={lead.id}>
                  <Link
                    href={`/s/${slug}/contacts`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-foreground/[0.04] hover:scale-[1.005] active:bg-foreground/[0.045] transition-[colors,transform] duration-150"
                  >
                    <div className="w-9 h-9 rounded-full bg-foreground/[0.06] text-muted-foreground flex items-center justify-center text-[11px] font-medium flex-shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {lead.name}
                        </p>
                        {isNew && (
                          <span className="inline-flex text-[10px] text-muted-foreground border border-border/70 rounded-md px-1.5 py-0.5 flex-shrink-0">
                            New
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(new Date(lead.createdAt))}
                        </span>
                        {typeLabel && (
                          <span className="inline-flex text-[10px] text-muted-foreground border border-border/70 rounded-md px-1.5 py-0.5">
                            {typeLabel}
                          </span>
                        )}
                        {scoreLabel && (
                          <span className="inline-flex text-[10px] text-muted-foreground border border-border/70 rounded-md px-1.5 py-0.5">
                            {scoreLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </StaggerItem>
              );
            })}
          </StaggerList>
        )}
      </section>
    </div>
  );
}
