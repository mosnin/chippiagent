'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Clock,
  CalendarDays,
  Briefcase,
  UserPlus,
  ArrowRight,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { ACTIVITY_META } from '@/lib/constants';

type ManualActivityType = 'note' | 'call' | 'email' | 'meeting' | 'follow_up';

type TimelineEntry = {
  id: string;
  kind: 'activity' | 'tour' | 'deal' | 'system';
  type: string;
  content: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

const TYPE_META = ACTIVITY_META;
const ACTIVITY_TYPES: ManualActivityType[] = ['note', 'call', 'email', 'meeting', 'follow_up'];

// Meta for system/tour/deal events
const SYSTEM_META: Record<string, { label: string; icon: typeof CalendarDays; color: string }> = {
  tour_scheduled: { label: 'Tour scheduled', icon: CalendarDays, color: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/10' },
  tour_confirmed: { label: 'Tour confirmed', icon: CalendarDays, color: 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10' },
  tour_completed: { label: 'Tour completed', icon: CalendarDays, color: 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-500/10' },
  tour_cancelled: { label: 'Tour cancelled', icon: CalendarDays, color: 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/10' },
  tour_no_show: { label: 'No-show', icon: CalendarDays, color: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10' },
  deal_created: { label: 'Deal created', icon: Briefcase, color: 'text-muted-foreground bg-muted' },
  contact_created: { label: 'Contact added', icon: UserPlus, color: 'text-muted-foreground bg-muted' },
  stage_change: { label: 'Stage change', icon: ArrowRight, color: 'text-muted-foreground bg-muted' },
  status_change: { label: 'Status change', icon: FileText, color: 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-500/10' },
};

function getEntryMeta(entry: TimelineEntry) {
  if (entry.kind === 'activity') {
    return (TYPE_META as any)[entry.type] ?? TYPE_META.note;
  }
  return SYSTEM_META[entry.type] ?? { label: entry.type, icon: Clock, color: 'text-muted-foreground bg-muted' };
}

export function ContactActivityTab({ contactId, contactCreatedAt }: { contactId: string; contactCreatedAt?: string }) {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<ManualActivityType>('note');
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const fetchTimeline = useCallback(async () => {
    setLoading(true);
    try {
      const [activitiesRes, toursRes] = await Promise.all([
        fetch(`/api/contacts/${contactId}/activity`),
        fetch(`/api/contacts/${contactId}/timeline`),
      ]);

      const entries: TimelineEntry[] = [];

      // Manual activities
      if (activitiesRes.ok) {
        const activities = await activitiesRes.json();
        for (const a of activities) {
          entries.push({
            id: a.id,
            kind: 'activity',
            type: a.type,
            content: a.content,
            metadata: a.metadata,
            createdAt: a.createdAt,
          });
        }
      }

      // Tour + deal events from timeline endpoint
      if (toursRes.ok) {
        const events = await toursRes.json();
        for (const e of events) {
          entries.push(e);
        }
      }

      // Contact creation event
      if (contactCreatedAt) {
        entries.push({
          id: 'contact-created',
          kind: 'system',
          type: 'contact_created',
          content: 'Contact was added to your workspace',
          metadata: null,
          createdAt: contactCreatedAt,
        });
      }

      // Sort by date descending
      entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTimeline(entries);
    } catch (err) {
      console.error('[timeline] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, [contactId, contactCreatedAt]);

  useEffect(() => { fetchTimeline(); }, [fetchTimeline]);

  async function handlePost() {
    if (!content.trim()) return;
    setPosting(true);
    setPostError(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content: content.trim() }),
      });
      if (res.ok) {
        const newActivity = await res.json();
        setTimeline((prev) => [{
          id: newActivity.id,
          kind: 'activity' as const,
          type: newActivity.type,
          content: newActivity.content,
          metadata: newActivity.metadata,
          createdAt: newActivity.createdAt,
        }, ...prev]);
        setContent('');
      } else {
        setPostError("Couldn't save that. Try again.");
      }
    } catch {
      setPostError("I lost the connection. Try again.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-2">
        <Clock size={14} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold">Timeline</h2>
        {timeline.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">{timeline.length} events</span>
        )}
      </div>

      {/* Add activity */}
      <div className="px-6 pt-4 pb-3 border-b border-border/60">
        <div className="flex gap-1 mb-3 flex-wrap">
          {ACTIVITY_TYPES.map((t) => {
            const meta = (TYPE_META as any)[t];
            const Icon = meta.icon;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  type === t ? meta.color : 'text-muted-foreground bg-muted hover:text-foreground',
                )}
              >
                <Icon size={11} />
                {meta.label}
              </button>
            );
          })}
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={`Add a ${(TYPE_META as any)[type].label.toLowerCase()}…`}
          rows={2}
          className="w-full text-sm rounded-lg border border-input bg-background px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost();
          }}
        />
        <div className="flex items-center justify-between mt-2">
          {postError ? (
            <p className="text-xs text-destructive">{postError}</p>
          ) : (
            <span />
          )}
          <Button size="sm" onClick={handlePost} disabled={posting || !content.trim()} className="gap-1.5">
            <Plus size={13} />
            {posting ? 'Posting…' : 'Post'}
          </Button>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-6 py-4">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-7 h-7 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-1.5 pt-1">
                  <div className="h-3 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && timeline.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No activity yet. Log a call, note, or email above.</p>
          </div>
        )}

        {!loading && timeline.length > 0 && (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[13px] top-4 bottom-4 w-px bg-border" />

            <div className="space-y-4">
              {timeline.map((entry) => {
                const meta = getEntryMeta(entry);
                const Icon = meta.icon;
                const isSystem = entry.kind !== 'activity';
                return (
                  <div key={entry.id} className="flex gap-3 relative">
                    <div className={cn('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 z-10', meta.color)}>
                      <Icon size={13} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn('text-xs font-semibold', isSystem ? 'text-muted-foreground' : 'text-foreground')}>
                          {meta.label}
                        </span>
                        <span className="text-xs text-muted-foreground">{timeAgo(entry.createdAt)}</span>
                      </div>
                      {entry.content && (
                        <p className={cn('text-sm mt-0.5 leading-relaxed whitespace-pre-wrap', isSystem ? 'text-muted-foreground/80 italic' : 'text-muted-foreground')}>
                          {entry.content}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
