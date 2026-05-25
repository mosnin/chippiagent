'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2, MessageSquare, Mail, StickyNote, Bell, Activity, Brain,
  ChevronRight, Loader2, Undo2, AlertCircle, CircleX, HelpCircle, Lightbulb,
  CalendarCheck, ArrowUpRight, Flag, Paperclip, ArrowRightLeft,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { toast } from 'sonner';

interface ActivityEntry {
  id: string;
  runId: string;
  agentType: string;
  actionType: string;
  reasoning: string | null;
  outcome: 'completed' | 'queued_for_approval' | 'suggested' | 'failed' | string;
  relatedContactId: string | null;
  relatedDealId: string | null;
  reversible: boolean;
  reversedAt: string | null;
  createdAt: string;
  Contact: { id: string; name: string } | null;
  Deal: { id: string; title: string } | null;
}

const ACTION_META: Record<string, { verb: string; icon: LucideIcon }> = {
  send_sms: { verb: 'sent SMS to', icon: MessageSquare },
  send_email: { verb: 'sent email to', icon: Mail },
  log_note: { verb: 'logged a note about', icon: StickyNote },
  create_draft_message: { verb: 'drafted a message for', icon: MessageSquare },
  message_drafted: { verb: 'drafted a message for', icon: MessageSquare },
  packet_drafted: { verb: 'drafted a packet share for', icon: Paperclip },
  set_contact_follow_up: { verb: 'scheduled a follow-up with', icon: Bell },
  set_deal_follow_up: { verb: 'scheduled a deal follow-up on', icon: Bell },
  log_agent_observation: { verb: 'noted something about', icon: Brain },
  log_observation: { verb: 'noted something about', icon: Brain },
  store_memory: { verb: 'remembered something about', icon: Brain },
  update_lead_score: { verb: 'updated the score for', icon: Activity },
  update_deal_probability: { verb: 'updated the probability on', icon: Activity },
  create_follow_up_reminder: { verb: 'set a reminder for', icon: Bell },
  // Lifecycle actions added with the broker rollup work
  tour_booked: { verb: 'booked a tour for', icon: CalendarCheck },
  deal_stage_advanced: { verb: 'moved a deal forward:', icon: ArrowUpRight },
  review_requested: { verb: 'flagged a deal for your broker:', icon: Flag },
  lead_routed_out: { verb: 'routed a contact to a teammate:', icon: ArrowRightLeft },
  lead_routed_in: { verb: 'received a contact from a teammate:', icon: ArrowRightLeft },
};

function metaFor(actionType: string): { verb: string; icon: LucideIcon } {
  return (
    ACTION_META[actionType] ?? {
      verb: actionType.replace(/_/g, ' '),
      icon: CheckCircle2,
    }
  );
}

const OUTCOME_META: Record<
  string,
  { label: string; tone: 'green' | 'amber' | 'rose' | 'muted' }
> = {
  completed: { label: 'done', tone: 'green' },
  queued_for_approval: { label: 'awaiting you', tone: 'amber' },
  suggested: { label: 'suggested', tone: 'amber' },
  failed: { label: 'failed', tone: 'rose' },
};

const OUTCOME_TONE_CLASS: Record<string, string> = {
  green: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400',
  rose: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400',
  muted: 'bg-muted text-muted-foreground',
};

const OUTCOME_ICON: Record<string, LucideIcon> = {
  green: CheckCircle2,
  amber: HelpCircle,
  rose: CircleX,
  muted: Lightbulb,
};

// Filter values for the toolbar. Failures aren't a thing the realtor wants
// to filter to — they appear inline with the rose tone in the All view.
const FILTERS = [
  { value: null, label: 'All' },
  { value: 'completed', label: 'Done' },
  { value: 'queued_for_approval', label: 'Awaiting you' },
] as const;

const UNDOABLE_TYPES = new Set(['set_contact_follow_up', 'set_deal_follow_up']);

export function ActivityFeed({ slug }: { slug: string }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filter) params.set('outcome', filter);
      const res = await fetch(`/api/agent/activity?${params}`);
      if (res.ok) {
        const data = (await res.json()) as ActivityEntry[];
        setEntries(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUndo(entry: ActivityEntry) {
    setUndoing(entry.id);
    try {
      const res = await fetch(`/api/agent/activity/${entry.id}/reverse`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "Couldn't undo that action.");
        return;
      }
      // Optimistic: mark this row reversed locally
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id ? { ...e, reversedAt: data?.reversedAt ?? new Date().toISOString() } : e,
        ),
      );
      toast.success('Undone.');
    } finally {
      setUndoing(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Filter toolbar */}
      <div className="flex items-center gap-1 border-b border-border/60 -mx-2 px-2 overflow-x-auto">
        {FILTERS.map((f) => {
          const isActive = filter === f.value;
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                'px-3 py-2 -mb-px text-sm whitespace-nowrap border-b-2 transition-colors',
                isActive
                  ? 'border-foreground text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted/40 animate-pulse" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-2/3 rounded bg-muted/40 animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-muted/30 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {filter
            ? 'Nothing matches that filter yet.'
            : "Chippi hasn't done anything to log yet — when it acts, it'll show up here."}
        </div>
      )}

      {!loading && entries.length > 0 && (
        <ul className="divide-y divide-border/60">
          {entries.map((entry) => {
            const { verb, icon: Icon } = metaFor(entry.actionType);
            const outcomeMeta = OUTCOME_META[entry.outcome] ?? { label: entry.outcome, tone: 'muted' };
            const StateIcon = OUTCOME_ICON[outcomeMeta.tone] ?? Lightbulb;
            const targetName = entry.Contact?.name ?? entry.Deal?.title ?? null;
            const targetHref = entry.Contact
              ? `/s/${slug}/contacts/${entry.Contact.id}`
              : entry.Deal
                ? `/s/${slug}/deals`
                : null;

            const canUndo =
              !entry.reversedAt &&
              entry.reversible &&
              UNDOABLE_TYPES.has(entry.actionType) &&
              entry.outcome === 'completed';

            return (
              <li key={entry.id} className="group/row py-4 first:pt-0">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                      OUTCOME_TONE_CLASS[outcomeMeta.tone],
                    )}
                  >
                    <Icon size={13} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-foreground">
                        I {verb}{' '}
                        {targetName ? (
                          targetHref ? (
                            <Link
                              href={targetHref}
                              className="font-medium text-foreground hover:underline underline-offset-2"
                            >
                              {targetName}
                            </Link>
                          ) : (
                            <span className="font-medium text-foreground">{targetName}</span>
                          )
                        ) : (
                          <span className="text-muted-foreground italic">a contact</span>
                        )}
                      </span>
                      <StateIcon
                        size={11}
                        className={cn(
                          'flex-shrink-0',
                          outcomeMeta.tone === 'green' && 'text-emerald-600 dark:text-emerald-400',
                          outcomeMeta.tone === 'amber' && 'text-amber-600 dark:text-amber-400',
                          outcomeMeta.tone === 'rose' && 'text-rose-600 dark:text-rose-400',
                          outcomeMeta.tone === 'muted' && 'text-muted-foreground',
                        )}
                      />
                      <span className="text-[11px] text-muted-foreground flex-shrink-0 tabular-nums ml-auto">
                        {timeAgo(entry.createdAt)}
                      </span>
                    </div>
                    {entry.reasoning && (
                      <p className="text-xs text-muted-foreground italic line-clamp-2 mt-1 leading-relaxed">
                        {entry.reasoning}
                      </p>
                    )}

                    <div className="flex items-center gap-3 mt-2">
                      {entry.reversedAt ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Undo2 size={11} />
                          undone {timeAgo(entry.reversedAt)}
                        </span>
                      ) : canUndo ? (
                        <button
                          type="button"
                          onClick={() => void handleUndo(entry)}
                          disabled={undoing === entry.id}
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                        >
                          {undoing === entry.id ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <Undo2 size={11} />
                          )}
                          Undo
                        </button>
                      ) : entry.outcome === 'failed' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400">
                          <AlertCircle size={11} />
                          Did not run
                        </span>
                      ) : null}

                      {targetHref && (
                        <Link
                          href={targetHref}
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-auto"
                        >
                          Open
                          <ChevronRight size={11} />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
