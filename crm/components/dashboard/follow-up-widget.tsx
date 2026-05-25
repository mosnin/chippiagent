'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Calendar, CheckCircle2, Phone, Mail, ChevronDown, ChevronUp, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LEAD_SCORE_COLORS } from '@/lib/constants/colors';

export interface FollowUpContact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  type: string;
  followUpAt: string;
  leadScore: number | null;
  scoreLabel: string | null;
}

interface Props {
  slug: string;
  contacts: FollowUpContact[];
}

const SNOOZE_OPTIONS = [
  { label: 'Later today', hours: 3 },
  { label: 'Tomorrow', hours: 24 },
  { label: 'In 2 days', hours: 48 },
  { label: 'Next week', hours: 168 },
] as const;


const TYPE_LABELS: Record<string, string> = {
  QUALIFICATION: 'Qual',
  TOUR: 'Tour',
  APPLICATION: 'App',
};

export function FollowUpWidget({ slug, contacts: initialContacts }: Props) {
  const [contacts, setContacts] = useState<FollowUpContact[]>(initialContacts);
  const [expanded, setExpanded] = useState(true);
  const [clearing, setClearing] = useState<Set<string>>(new Set());
  const [snoozeOpen, setSnoozeOpen] = useState<string | null>(null);

  async function handleClearFollowUp(id: string) {
    setClearing((s) => new Set(s).add(id));
    try {
      await fetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followUpAt: null }),
      });
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setClearing((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  async function handleSnooze(id: string, hours: number) {
    setSnoozeOpen(null);
    setClearing((s) => new Set(s).add(id));
    try {
      const newFollowUp = new Date(Date.now() + hours * 3600000).toISOString();
      await fetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followUpAt: newFollowUp }),
      });
      setContacts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, followUpAt: newFollowUp } : c))
      );
    } finally {
      setClearing((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  if (contacts.length === 0) {
    if (initialContacts.length === 0) return null;
    // User cleared all follow-ups this session — show success state
    return (
      <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/25 bg-emerald-50/60 dark:bg-emerald-500/5 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">All caught up!</p>
            <p className="text-xs text-emerald-700/70 dark:text-emerald-400/70">
              No follow-ups due right now. Nice work.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const overdue = contacts.filter((c) => new Date(c.followUpAt) < new Date());

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-accent transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
            <Calendar size={14} className="text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Follow-ups due
            </p>
            <p className="text-xs text-muted-foreground">
              {overdue.length} overdue · {contacts.length} total
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp size={15} className="text-muted-foreground/60 flex-shrink-0" />
        ) : (
          <ChevronDown size={15} className="text-muted-foreground/60 flex-shrink-0" />
        )}
      </button>

      {/* Contact rows */}
      {expanded && (
        <div className="border-t border-border divide-y divide-border">
          {contacts.map((contact) => {
            const date = new Date(contact.followUpAt);
            const isOverdue = date < new Date();
            const isBusy = clearing.has(contact.id);
            const typeLabel = TYPE_LABELS[contact.type] ?? contact.type;
            return (
              <div
                key={contact.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 transition-opacity',
                  isBusy && 'opacity-50'
                )}
              >
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-semibold text-xs flex-shrink-0">
                  {contact.name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/s/${slug}/contacts/${contact.id}`}
                      className="text-sm font-medium hover:text-foreground transition-colors truncate"
                    >
                      {contact.name}
                    </Link>
                    {contact.scoreLabel && (
                      <span
                        className={cn(
                          'inline-flex items-center text-[10px] font-semibold rounded px-1.5 py-0.5 leading-none',
                          (LEAD_SCORE_COLORS[contact.scoreLabel as keyof typeof LEAD_SCORE_COLORS]?.badge) ?? LEAD_SCORE_COLORS.unscored.badge
                        )}
                      >
                        {contact.scoreLabel}
                      </span>
                    )}
                    <span className="inline-flex items-center text-[10px] font-medium rounded px-1.5 py-0.5 leading-none bg-muted text-muted-foreground">
                      {typeLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {contact.phone && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Phone size={10} /> {contact.phone}
                      </span>
                    )}
                    {contact.email && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground truncate max-w-[150px]">
                        <Mail size={10} /> {contact.email}
                      </span>
                    )}
                  </div>
                </div>

                {/* Date + snooze + clear */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={cn(
                      'text-[11px] font-semibold rounded-md px-2 py-0.5',
                      isOverdue
                        ? 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                    )}
                  >
                    {isOverdue ? 'Overdue' : 'Due'}{' '}
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>

                  {/* Snooze button */}
                  <div className="relative">
                    <button
                      type="button"
                      title="Snooze"
                      disabled={isBusy}
                      onClick={() =>
                        setSnoozeOpen((prev) => (prev === contact.id ? null : contact.id))
                      }
                      className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                      <Timer size={14} />
                    </button>
                    {snoozeOpen === contact.id && (
                      <div className="absolute right-0 top-8 z-50 w-36 rounded-md border bg-popover text-popover-foreground shadow-md py-1">
                        {SNOOZE_OPTIONS.map((opt) => (
                          <button
                            key={opt.hours}
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                            onClick={() => handleSnooze(contact.id, opt.hours)}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    title="Mark done"
                    disabled={isBusy}
                    onClick={() => handleClearFollowUp(contact.id)}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/15 transition-colors"
                  >
                    <CheckCircle2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}

          {/* View all link */}
          <div className="px-4 py-2.5">
            <Link
              href={`/s/${slug}/follow-ups`}
              className="block w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              View all &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
