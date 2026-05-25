'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Bot, CheckCircle2, Clock, AlertCircle, Lightbulb,
  ArrowRight, ChevronRight, User, Briefcase,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { ChippiAvatar } from './chippi-avatar';

const ACTION_LABELS: Record<string, string> = {
  create_draft_message: 'Drafted message',
  set_contact_follow_up: 'Scheduled follow-up',
  set_deal_follow_up: 'Scheduled deal follow-up',
  log_agent_observation: 'Logged observation',
  update_lead_score: 'Updated lead score',
  update_deal_probability: 'Updated deal probability',
  create_follow_up_reminder: 'Created reminder',
  log_observation: 'Logged observation',
  store_memory: 'Stored insight',
};

function formatAction(t: string): string {
  return ACTION_LABELS[t] ?? t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const AGENT_LABELS: Record<string, string> = {
  lead_nurture: 'Lead Nurture',
  deal_sentinel: 'Deal Sentinel',
  long_term_nurture: 'Long-term Nurture',
  lead_scorer: 'Lead Scorer',
  tour_followup: 'Tour Follow-up',
};

function formatAgent(t: string): string {
  return AGENT_LABELS[t] ?? t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const OUTCOME_CFG = {
  completed: { icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400' },
  queued_for_approval: { icon: Clock, cls: 'text-amber-500 dark:text-amber-400' },
  suggested: { icon: Lightbulb, cls: 'text-amber-400 dark:text-amber-300' },
  failed: { icon: AlertCircle, cls: 'text-rose-600 dark:text-rose-400' },
} as const;

// ─── types ────────────────────────────────────────────────────────────────────

interface ActivityEntry {
  id: string;
  runId: string;
  agentType: string;
  actionType: string;
  outcome: keyof typeof OUTCOME_CFG;
  relatedContactId: string | null;
  relatedDealId: string | null;
  createdAt: string;
  Contact: { id: string; name: string } | null;
  Deal: { id: string; title: string } | null;
}

interface RunGroup {
  runId: string;
  agentType: string;
  entries: ActivityEntry[];
  startedAt: string;
}

interface Insight {
  id: string;
  content: string;
  importance: number;
  entityType: string;
  entityId: string;
  entityName: string | null;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function MissionControlSkeleton() {
  return (
    <div className="rounded-lg border border-border/70 bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
        <div className="w-3.5 h-3.5 rounded-full bg-muted animate-pulse" />
        <div className="w-16 h-4 bg-muted rounded animate-pulse" />
        <div className="w-14 h-5 bg-muted rounded-full animate-pulse" />
      </div>
      <div className="p-5 space-y-3">
        {[80, 60, 72].map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-3.5 h-3.5 rounded-full bg-muted animate-pulse flex-shrink-0" />
            <div className="h-4 bg-muted rounded animate-pulse" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const VISIBLE_ACTIONS = 4;

export function AgentMissionControl({ slug }: { slug: string }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pendingDrafts, setPendingDrafts] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [activityRes, insightsRes, settingsRes, draftsRes] = await Promise.all([
          fetch('/api/agent/activity?limit=20'),
          fetch('/api/agent/insights'),
          fetch('/api/agent/settings'),
          fetch('/api/agent/drafts?status=pending&limit=1'),
        ]);
        if (activityRes.ok) setEntries(await activityRes.json());
        if (insightsRes.ok) setInsights(await insightsRes.json());
        if (settingsRes.ok) {
          const s = (await settingsRes.json()) as { enabled?: boolean };
          setEnabled(s.enabled ?? false);
        }
        if (draftsRes.ok) {
          const drafts = (await draftsRes.json()) as unknown[];
          setPendingDrafts(Array.isArray(drafts) ? drafts.length : 0);
        }
      } catch {
        // widget is non-critical; fail silently
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) return <MissionControlSkeleton />;

  // Group consecutive entries by runId (API returns DESC order so first = newest)
  const runs = useMemo<RunGroup[]>(() => {
    const result: RunGroup[] = [];
    for (const entry of entries) {
      const last = result[result.length - 1];
      if (last && last.runId === entry.runId) {
        last.entries.push(entry);
      } else {
        result.push({ runId: entry.runId, agentType: entry.agentType, entries: [entry], startedAt: entry.createdAt });
      }
    }
    return result;
  }, [entries]);

  const latestRun = runs[0] ?? null;
  const lastRanAt = entries[0]?.createdAt ?? null;
  const hasActivity = entries.length > 0;
  const hasInsights = insights.length > 0;
  const hasAnything = hasActivity || hasInsights || pendingDrafts > 0;

  // If agent is off and nothing to show, hide the widget entirely
  if (enabled === false && !hasAnything) return null;

  const latestRunActions = latestRun?.entries.slice(0, VISIBLE_ACTIONS) ?? [];
  const hiddenCount = latestRun ? Math.max(0, latestRun.entries.length - VISIBLE_ACTIONS) : 0;

  // Count outcomes across the full latest run (not the truncated slice)
  const runCompleted = latestRun?.entries.filter((e) => e.outcome === 'completed').length ?? 0;
  const runQueued = latestRun?.entries.filter((e) => e.outcome === 'queued_for_approval').length ?? 0;
  const runFailed = latestRun?.entries.filter((e) => e.outcome === 'failed').length ?? 0;

  return (
    <div className="rounded-lg border border-border/70 bg-card overflow-hidden">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <ChippiAvatar size="xs" className={enabled ? undefined : 'opacity-40'} pulse={!!enabled} />
          <h2 className="text-sm font-semibold flex-shrink-0">Agent</h2>
          <span className={cn(
            'inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0',
            enabled
              ? 'bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-400'
              : 'bg-muted text-muted-foreground',
          )}>
            <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', enabled ? 'bg-orange-500' : 'bg-muted-foreground/40')} />
            {enabled ? 'Active' : 'Off'}
          </span>
          {lastRanAt && (
            <span className="hidden sm:block text-[11px] text-muted-foreground truncate">
              · Last ran {timeAgo(lastRanAt)}
            </span>
          )}
        </div>
        <Link
          href={`/s/${slug}/chippi`}
          className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 ml-3"
        >
          Agent hub <ArrowRight size={10} />
        </Link>
      </div>

      {/* Agent is off — enable nudge (only when no historical data) */}
      {enabled === false && !hasActivity && !hasInsights && pendingDrafts === 0 && (
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
            <Bot size={14} className="text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Bring Chippi on as your cowork</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Chippi watches your leads, drafts the follow-ups, and hands them to you for a quick read.
            </p>
          </div>
          <Link
            href={`/s/${slug}/agent?tab=settings`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:underline flex-shrink-0"
          >
            Turn on <ArrowRight size={12} />
          </Link>
        </div>
      )}

      {/* Pending drafts CTA */}
      {pendingDrafts > 0 && (
        <Link
          href={`/s/${slug}/chippi`}
          className="flex items-center justify-between gap-3 px-5 py-3 bg-orange-500/5 border-b border-border hover:bg-orange-500/10 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {pendingDrafts > 9 ? '9+' : pendingDrafts}
            </span>
            <div>
              <p className="text-sm font-medium">
                {pendingDrafts === 1 ? '1 draft' : `${pendingDrafts} drafts`} awaiting your approval
              </p>
              <p className="text-xs text-muted-foreground">Review, edit, and send in the inbox</p>
            </div>
          </div>
          <ChevronRight size={14} className="text-muted-foreground shrink-0" />
        </Link>
      )}

      {/* Latest run */}
      {latestRun && (
        <>
          {/* Run header bar */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-5 py-2.5 bg-muted/20 border-b border-border/60">
            <span className="text-xs font-semibold text-foreground flex-shrink-0">{formatAgent(latestRun.agentType)}</span>
            <span className="text-[11px] text-muted-foreground">·</span>
            <span className="text-[11px] text-muted-foreground flex-shrink-0">
              {latestRun.entries.length} action{latestRun.entries.length !== 1 ? 's' : ''}
            </span>
            {runCompleted > 0 && (
              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
                {runCompleted} done
              </span>
            )}
            {runQueued > 0 && (
              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
                {runQueued} draft{runQueued !== 1 ? 's' : ''}
              </span>
            )}
            {runFailed > 0 && (
              <span className="text-[11px] font-medium text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
                {runFailed} failed
              </span>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground flex-shrink-0">{timeAgo(latestRun.startedAt)}</span>
          </div>

          {/* Action rows */}
          <div className="divide-y divide-border/50 border-b border-border">
            {latestRunActions.map((entry) => {
              const cfg = OUTCOME_CFG[entry.outcome] ?? OUTCOME_CFG.completed;
              const Icon = cfg.icon;
              return (
                <div key={entry.id} className="flex items-center gap-3 px-5 py-2.5">
                  <Icon size={13} className={cn('flex-shrink-0', cfg.cls)} />
                  <span className="text-sm flex-1 min-w-0 truncate">{formatAction(entry.actionType)}</span>
                  {entry.Contact && (
                    <Link
                      href={`/s/${slug}/contacts/${entry.Contact.id}`}
                      className="inline-flex items-center gap-0.5 text-xs text-orange-500 dark:text-orange-400 hover:underline underline-offset-2 flex-shrink-0"
                    >
                      <User size={10} />
                      <span className="max-w-[120px] truncate">{entry.Contact.name}</span>
                    </Link>
                  )}
                  {!entry.Contact && entry.Deal && (
                    <Link
                      href={`/s/${slug}/deals`}
                      className="inline-flex items-center gap-0.5 text-xs text-orange-500 dark:text-orange-400 hover:underline underline-offset-2 flex-shrink-0"
                    >
                      <Briefcase size={10} />
                      <span className="max-w-[120px] truncate">{entry.Deal.title}</span>
                    </Link>
                  )}
                </div>
              );
            })}
          </div>

          {/* "N more" overflow link */}
          {hiddenCount > 0 && (
            <Link
              href={`/s/${slug}/chippi`}
              className="flex items-center gap-1 px-5 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors border-b border-border"
            >
              +{hiddenCount} more action{hiddenCount !== 1 ? 's' : ''}
              <ChevronRight size={11} />
            </Link>
          )}
        </>
      )}

      {/* Agent is on but nothing happened yet */}
      {enabled && !hasActivity && !hasInsights && pendingDrafts === 0 && (
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="w-8 h-8 rounded-md bg-orange-500/10 flex items-center justify-center flex-shrink-0">
            <Bot size={14} className="text-orange-500" />
          </div>
          <div>
            <p className="text-sm font-medium">Chippi is settling in</p>
            <p className="text-xs text-muted-foreground mt-0.5">First sweep through your pipeline coming up &mdash; I&apos;ll post anything worth your attention here.</p>
          </div>
        </div>
      )}

      {/* Key observations */}
      {hasInsights && (
        <>
          <div className="px-5 py-2 bg-muted/20 border-b border-border/60">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Key observations</p>
          </div>
          <div className="divide-y divide-border">
            {insights.slice(0, 3).map((insight) => {
              const href =
                insight.entityType === 'contact'
                  ? `/s/${slug}/contacts/${insight.entityId}?tab=intelligence`
                  : insight.entityType === 'deal'
                    ? `/s/${slug}/deals/${insight.entityId}?tab=overview`
                    : `/s/${slug}/chippi`;
              return (
                <Link
                  key={insight.id}
                  href={href}
                  className="flex items-start gap-3 px-5 py-3 hover:bg-muted/30 transition-colors group"
                >
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full mt-[5px] flex-shrink-0',
                    insight.importance >= 0.7 ? 'bg-red-500' :
                    insight.importance >= 0.4 ? 'bg-amber-400' :
                    'bg-muted-foreground/30',
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug line-clamp-2">{insight.content}</p>
                    {insight.entityName && (
                      <span className={cn(
                        'mt-1 inline-flex text-[11px] font-medium rounded px-1.5 py-0.5',
                        insight.entityType === 'contact'
                          ? 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400'
                          : insight.entityType === 'deal'
                            ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400'
                            : 'bg-muted text-muted-foreground',
                      )}>
                        {insight.entityName}
                      </span>
                    )}
                  </div>
                  <ChevronRight size={13} className="text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors flex-shrink-0 mt-0.5" />
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
