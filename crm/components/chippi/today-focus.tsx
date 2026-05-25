'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Phone, Mail, ChevronRight, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { HOT_LEAD_THRESHOLD } from '@/lib/constants';
import { STAGGER_CONTAINER, STAGGER_ITEM } from '@/lib/motion';

interface PriorityItem {
  contactId: string;
  name: string;
  reason: string;
  leadScore: number;
  leadType: 'rental' | 'buyer' | null;
  hasEmail: boolean;
  hasPhone: boolean;
}

interface PriorityData {
  items: PriorityItem[];
  generatedAt: string | null;
}

/**
 * "Today's focus" — Chippi's curated picks of contacts to reach out to.
 * Backed by the AgentMemory PRIORITY_LIST written by the coordinator after
 * each run. Hides itself when there's no priority list yet (newly enabled
 * agent, or pre-first-run).
 */
export function TodayFocus({ slug }: { slug: string }) {
  const [data, setData] = useState<PriorityData>({ items: [], generatedAt: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/agent/priority', { signal: controller.signal });
        if (res.ok) {
          const json = await res.json();
          setData({
            items: json.items ?? [],
            generatedAt: json.generatedAt ?? null,
          });
        }
      } catch {
        // non-critical
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  // Hide entirely when nothing to show
  if (!loading && data.items.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-3 pb-3 border-b border-border/60">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Who to reach today
        </h2>
        {!loading && data.items.length > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {data.items.length}
          </span>
        )}
        {data.generatedAt && (
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            {timeAgo(data.generatedAt)}
          </span>
        )}
      </div>

      {loading && (
        <div className="space-y-3 pt-5">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-muted/40 animate-pulse" />
              <div className="flex-1 h-4 rounded bg-muted/30 animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {!loading && data.items.length > 0 && (
        <motion.div
          className="divide-y divide-border/60"
          variants={STAGGER_CONTAINER}
          initial="initial"
          animate="enter"
        >
          {data.items.slice(0, 6).map((item) => (
            <motion.div key={item.contactId} variants={STAGGER_ITEM}>
              <Link
                href={`/s/${slug}/contacts/${item.contactId}`}
                className="group/row flex items-center gap-3 py-3 first:pt-4 last:pb-0 hover:bg-muted/20 -mx-3 px-3 rounded-lg transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-orange-600 dark:text-orange-400">
                  {item.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
                    {item.leadScore >= HOT_LEAD_THRESHOLD && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-orange-600 dark:text-orange-400">
                        <MessageCircle size={10} />
                        hot
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{item.reason}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 text-muted-foreground">
                  {item.hasPhone && <Phone size={11} />}
                  {item.hasEmail && <Mail size={11} />}
                  <ChevronRight
                    size={13}
                    className={cn(
                      'transition-opacity ml-1',
                      'opacity-0 group-hover/row:opacity-60',
                    )}
                  />
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}
    </section>
  );
}
