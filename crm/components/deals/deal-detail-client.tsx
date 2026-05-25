'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Activity, Send, ArrowRight, FileText, PhoneCall, Mail, Users, Clock, CheckCircle2 } from 'lucide-react';
import type { DealActivity } from '@/lib/types';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';

const ACTIVITY_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  note: { label: 'Note', icon: FileText, color: 'text-slate-500 dark:text-slate-400' },
  call: { label: 'Call', icon: PhoneCall, color: 'text-blue-500 dark:text-blue-400' },
  email: { label: 'Email', icon: Mail, color: 'text-violet-500 dark:text-violet-400' },
  meeting: { label: 'Meeting', icon: Users, color: 'text-teal-500 dark:text-teal-400' },
  follow_up: { label: 'Follow-up', icon: Clock, color: 'text-amber-500 dark:text-amber-400' },
  stage_change: { label: 'Stage changed', icon: Activity, color: 'text-indigo-500 dark:text-indigo-400' },
  status_change: { label: 'Status changed', icon: CheckCircle2, color: 'text-green-500 dark:text-green-400' },
};

const STATUS_CHANGE_META: Record<string, { label: string; className: string }> = {
  active: { label: 'Set to Active', className: 'bg-muted text-muted-foreground' },
  won: { label: 'Marked as Won', className: 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15' },
  lost: { label: 'Marked as Lost', className: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
  on_hold: { label: 'Put On Hold', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
};

/**
 * Parses stage names out of a stage_change content string like:
 *   Moved from "Old Stage" to "New Stage"
 * Returns { from, to } or null if the pattern doesn't match.
 */
function parseStageChangeContent(content: string | null): { from: string; to: string } | null {
  if (!content) return null;
  const match = content.match(/^Moved from "(.+)" to "(.+)"$/);
  if (!match) return null;
  return { from: match[1], to: match[2] };
}

interface Props {
  dealId: string;
  slug: string;
  initialActivities: DealActivity[];
}

export function DealDetailClient({ dealId, slug: _slug, initialActivities }: Props) {
  const [activities, setActivities] = useState<DealActivity[]>(initialActivities);
  const [type, setType] = useState('note');
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePost() {
    if (!content.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content: content.trim() }),
      });
      if (res.ok) {
        const created = await res.json();
        setActivities((prev) => [created, ...prev]);
        setContent('');
      } else {
        setError("Couldn't save that. Try again.");
      }
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-4">
      <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <Activity size={14} className="text-muted-foreground" />
        Activity
      </h2>

      {/* Add entry */}
      <div className="rounded-xl border border-border p-3 space-y-2.5 mb-5">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="note">Note</SelectItem>
            <SelectItem value="call">Call</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="meeting">Meeting</SelectItem>
            <SelectItem value="follow_up">Follow-up</SelectItem>
          </SelectContent>
        </Select>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handlePost(); }}
          placeholder="Add a note, log a call…"
          rows={2}
          className="resize-none text-sm"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end">
          <Button size="sm" onClick={handlePost} disabled={!content.trim() || posting}>
            <Send size={12} className="mr-1.5" />
            Post
          </Button>
        </div>
      </div>

      {/* Timeline */}
      {activities.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          <Activity size={28} className="mx-auto mb-2 opacity-30" />
          No activity yet. Log a call or add a note.
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map((activity) => {
            const meta = ACTIVITY_META[activity.type] ?? ACTIVITY_META.note;
            const Icon = meta.icon;

            // --- stage_change: parse from/to names out of content ---
            const stageNames =
              activity.type === 'stage_change'
                ? parseStageChangeContent(activity.content)
                : null;

            // --- status_change: read toStatus from metadata ---
            const toStatus =
              activity.type === 'status_change' && activity.metadata
                ? (activity.metadata.toStatus as string | undefined)
                : undefined;
            const statusChangeMeta =
              toStatus ? STATUS_CHANGE_META[toStatus] ?? null : null;

            return (
              <div key={activity.id} className="flex gap-3">
                <div className={cn('flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center mt-0.5', meta.color)}>
                  <Icon size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  {/* stage_change with parseable names */}
                  {activity.type === 'stage_change' && stageNames ? (
                    <>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="rounded-full px-2 py-0.5 text-xs bg-muted text-muted-foreground">{stageNames.from}</span>
                        <ArrowRight size={11} className="text-muted-foreground flex-shrink-0" />
                        <span className="rounded-full px-2 py-0.5 text-xs bg-muted text-muted-foreground">{stageNames.to}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5 block">
                        {timeAgo(new Date(activity.createdAt))}
                      </span>
                    </>
                  ) : activity.type === 'status_change' && statusChangeMeta ? (
                    /* status_change with known toStatus */
                    <>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusChangeMeta.className)}>
                          {statusChangeMeta.label}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5 block">
                        {timeAgo(new Date(activity.createdAt))}
                      </span>
                    </>
                  ) : (
                    /* default rendering for note / call / email / meeting / follow_up,
                       and fallback for stage_change / status_change with missing metadata */
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold">{meta.label}</span>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(new Date(activity.createdAt))}</span>
                      </div>
                      {activity.content && (
                        <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{activity.content}</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
