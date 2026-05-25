'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  CheckCircle2, MessageSquare, Mail, StickyNote, Bell, Activity, Brain, ChevronRight, ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { timeAgo } from '@/lib/formatting';
import { STAGGER_CONTAINER, STAGGER_ITEM } from '@/lib/motion';

interface ActivityEntry {
  id: string;
  runId: string;
  agentType: string;
  actionType: string;
  reasoning: string | null;
  outcome: string;
  relatedContactId: string | null;
  relatedDealId: string | null;
  reversible: boolean;
  reversedAt: string | null;
  createdAt: string;
  Contact: { id: string; name: string } | null;
  Deal: { id: string; title: string } | null;
}

// Action type → user-facing verb + icon. Anything not in the map gets a
// generic neutral row so the feed never looks broken.
const ACTION_META: Record<string, { verb: string; icon: LucideIcon }> = {
  send_sms: { verb: 'sent SMS to', icon: MessageSquare },
  send_email: { verb: 'sent email to', icon: Mail },
  log_note: { verb: 'logged a note about', icon: StickyNote },
  create_draft_message: { verb: 'drafted a message for', icon: MessageSquare },
  set_contact_follow_up: { verb: 'scheduled a follow-up with', icon: Bell },
  set_deal_follow_up: { verb: 'scheduled a deal follow-up on', icon: Bell },
  log_agent_observation: { verb: 'noted something about', icon: Brain },
  log_observation: { verb: 'noted something about', icon: Brain },
  store_memory: { verb: 'remembered something about', icon: Brain },
  update_lead_score: { verb: 'updated the score for', icon: Activity },
  update_deal_probability: { verb: 'updated the probability on', icon: Activity },
  create_follow_up_reminder: { verb: 'set a reminder for', icon: Bell },
};

function metaFor(actionType: string): { verb: string; icon: LucideIcon } {
  return (
    ACTION_META[actionType] ?? {
      verb: actionType.replace(/_/g, ' '),
      icon: CheckCircle2,
    }
  );
}

/**
 * "What I did" — proof of work. Most-recent autonomous actions Chippi
 * completed without human intervention. First section of the dispatch
 * console so the realtor opens the page and immediately sees the agent
 * earned its keep.
 *
 * Hides itself when there's no recent activity (newly-enabled agent,
 * pre-first-run) so the page doesn't read as empty.
 */
export function WhatIDid({ slug }: { slug: string }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/agent/activity?outcome=completed&limit=10', {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as ActivityEntry[];
          setEntries(Array.isArray(data) ? data : []);
        }
      } catch {
        // non-critical
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  // Hide when nothing to show — mirrors AgentQuestionsPanel behavior so the
  // dispatch console reads calm on quiet days.
  if (!loading && entries.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-3 pb-3 border-b border-border/60">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          What I did
        </h2>
        {!loading && entries.length > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums">{entries.length}</span>
        )}
        {!loading && entries.length > 0 && (
          <Link
            href={`/s/${slug}/chippi/activity`}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            See all
            <ArrowRight size={11} />
          </Link>
        )}
      </div>

      {loading && (
        <div className="space-y-3 pt-5">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-muted/40 animate-pulse" />
              <div className="flex-1 h-4 rounded bg-muted/30 animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {!loading && entries.length > 0 && (
        <motion.div
          className="divide-y divide-border/60"
          variants={STAGGER_CONTAINER}
          initial="initial"
          animate="enter"
        >
          {entries.slice(0, 6).map((entry) => {
            const { verb, icon: Icon } = metaFor(entry.actionType);
            const targetName = entry.Contact?.name ?? entry.Deal?.title ?? null;
            const targetHref = entry.Contact
              ? `/s/${slug}/contacts/${entry.Contact.id}`
              : entry.Deal
                ? `/s/${slug}/deals`
                : null;

            const RowInner = (
              <>
                <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <Icon size={13} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">
                    <span className="text-foreground">I {verb}</span>{' '}
                    {targetName ? (
                      <span className="font-medium text-foreground">{targetName}</span>
                    ) : (
                      <span className="text-muted-foreground italic">a contact</span>
                    )}
                  </p>
                  {entry.reasoning && (
                    <p className="text-xs text-muted-foreground italic line-clamp-1 mt-0.5">
                      {entry.reasoning}
                    </p>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground flex-shrink-0 tabular-nums">
                  {timeAgo(entry.createdAt)}
                </span>
                {targetHref && (
                  <ChevronRight
                    size={13}
                    className="ml-1 flex-shrink-0 text-muted-foreground/0 group-hover/row:text-muted-foreground/60 transition-colors"
                  />
                )}
              </>
            );

            if (targetHref) {
              return (
                <motion.div key={entry.id} variants={STAGGER_ITEM}>
                  <Link
                    href={targetHref}
                    className="group/row flex items-center gap-3 py-3 first:pt-4 -mx-3 px-3 rounded-lg hover:bg-muted/20 transition-colors"
                  >
                    {RowInner}
                  </Link>
                </motion.div>
              );
            }
            return (
              <motion.div
                key={entry.id}
                variants={STAGGER_ITEM}
                className="flex items-center gap-3 py-3 first:pt-4"
              >
                {RowInner}
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </section>
  );
}
