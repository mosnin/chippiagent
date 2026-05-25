'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Calendar, Clock, MapPin, Phone, Mail, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { STAGGER_CONTAINER, STAGGER_ITEM } from '@/lib/motion';

interface FollowUpDue {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  type: string | null;
  followUpAt: string;
  leadScore: number | null;
  scoreLabel: string | null;
}

interface UpcomingTour {
  id: string;
  guestName: string | null;
  startsAt: string;
  endsAt: string | null;
  propertyAddress: string | null;
  status: string;
}

interface TodayData {
  followUpsDue: FollowUpDue[];
  toursUpcoming: UpcomingTour[];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * "What's coming" — the day-ahead section of the dispatch console.
 * Shows tours scheduled forward and follow-ups due today or overdue.
 * Hides itself when both lists are empty so quiet days stay calm.
 */
export function WhatsComing({ slug }: { slug: string }) {
  const [data, setData] = useState<TodayData>({ followUpsDue: [], toursUpcoming: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/agent/today', { signal: controller.signal });
        if (res.ok) {
          const json = await res.json();
          setData({
            followUpsDue: json.followUpsDue ?? [],
            toursUpcoming: json.toursUpcoming ?? [],
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

  const total = data.followUpsDue.length + data.toursUpcoming.length;
  if (!loading && total === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-3 pb-3 border-b border-border/60">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          What&apos;s coming
        </h2>
        {!loading && total > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums">{total}</span>
        )}
      </div>

      {loading && (
        <div className="space-y-3 pt-5">
          {[1, 2].map((n) => (
            <div key={n} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-muted/40 animate-pulse" />
              <div className="flex-1 h-4 rounded bg-muted/30 animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {!loading && total > 0 && (
        <motion.div
          className="divide-y divide-border/60"
          variants={STAGGER_CONTAINER}
          initial="initial"
          animate="enter"
        >
          {data.toursUpcoming.map((tour) => (
            <motion.div key={tour.id} variants={STAGGER_ITEM}>
              <Link
                href={`/s/${slug}/calendar`}
                className="group/row flex items-center gap-3 py-3 first:pt-4 -mx-3 px-3 rounded-lg hover:bg-muted/20 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <Calendar size={14} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-foreground tabular-nums">
                      {formatDay(tour.startsAt)} · {formatTime(tour.startsAt)}
                    </span>
                    {tour.guestName && (
                      <span className="text-muted-foreground truncate">with {tour.guestName}</span>
                    )}
                  </div>
                  {tour.propertyAddress && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin size={10} />
                      <span className="truncate">{tour.propertyAddress}</span>
                    </p>
                  )}
                </div>
                <ChevronRight
                  size={13}
                  className="flex-shrink-0 text-muted-foreground/0 group-hover/row:text-muted-foreground/60 transition-colors"
                />
              </Link>
            </motion.div>
          ))}

          {data.followUpsDue.map((contact) => {
            const overdueMs = Date.now() - new Date(contact.followUpAt).getTime();
            const isOverdue = overdueMs > 0;
            return (
              <motion.div key={contact.id} variants={STAGGER_ITEM}>
                <Link
                  href={`/s/${slug}/contacts/${contact.id}`}
                  className="group/row flex items-center gap-3 py-3 first:pt-4 -mx-3 px-3 rounded-lg hover:bg-muted/20 transition-colors"
                >
                  <div
                    className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                      isOverdue
                        ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <Clock size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-foreground truncate">{contact.name}</span>
                      <span
                        className={cn(
                          'text-xs',
                          isOverdue ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                        )}
                      >
                        {isOverdue
                          ? `overdue ${timeAgo(contact.followUpAt)}`
                          : `due ${timeAgo(contact.followUpAt)}`}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Follow-up you set
                      {contact.type ? ` · ${contact.type}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 text-muted-foreground">
                    {contact.phone && <Phone size={11} />}
                    {contact.email && <Mail size={11} />}
                    <ChevronRight
                      size={13}
                      className="ml-1 text-muted-foreground/0 group-hover/row:text-muted-foreground/60 transition-colors"
                    />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </section>
  );
}
