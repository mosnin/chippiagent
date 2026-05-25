'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { H1, TITLE_FONT } from '@/lib/typography';
import {
  CheckCircle2, Phone, Mail, Briefcase, Timer,
} from 'lucide-react';

type ContactFollowUp = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: string;
  followUpAt: string;
  lastContactedAt: string | null;
  leadScore: number | null;
  scoreLabel: string | null;
  tags: string[];
};

type DealFollowUp = {
  id: string;
  title: string;
  address: string | null;
  value: number | null;
  followUpAt: string;
};

type Tab = 'overdue' | 'today' | 'upcoming';

interface Props {
  slug: string;
  contacts: ContactFollowUp[];
  deals: DealFollowUp[];
}

export const SNOOZE_OPTIONS = [
  { label: 'Later today', hours: 6 },
  { label: 'Tomorrow', hours: 24 },
  { label: 'In 3 days', hours: 72 },
  { label: 'Next week', hours: 168 },
] as const;

/** Compute the ISO timestamp for a snooze option. Matches the inline math used
 * in the follow-ups list (`new Date(Date.now() + hours*3600*1000)`) so quick
 * buttons in other views produce identical values. */
export function snoozeDateFromHours(hours: number): string {
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}

function getScoreBadge(scoreLabel: string | null) {
  if (!scoreLabel) return null;
  const colors: Record<string, string> = {
    hot: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
    warm: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    cold: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
    unqualified: 'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400',
  };
  return colors[scoreLabel] ?? colors.unqualified;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    // Today - show time
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays < -1) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays <= 7) return `In ${diffDays}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function isOverdue(dateStr: string) {
  return new Date(dateStr) < new Date() && !isToday(dateStr);
}

function isUpcoming(dateStr: string) {
  return !isOverdue(dateStr) && !isToday(dateStr);
}

export function FollowUpsView({ slug, contacts: initialContacts, deals: initialDeals }: Props) {
  const [contacts, setContacts] = useState(initialContacts);
  const [deals, setDeals] = useState(initialDeals);
  const [tab, setTab] = useState<Tab>('overdue');
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [snoozeOpen, setSnoozeOpen] = useState<string | null>(null);

  // Close snooze dropdown on click outside
  useEffect(() => {
    if (!snoozeOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-snooze-dropdown]')) setSnoozeOpen(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [snoozeOpen]);

  const overdue = contacts.filter(c => isOverdue(c.followUpAt));
  const today = contacts.filter(c => isToday(c.followUpAt));
  const upcoming = contacts.filter(c => isUpcoming(c.followUpAt));

  const overdueDeals = deals.filter(d => isOverdue(d.followUpAt));
  const todayDeals = deals.filter(d => isToday(d.followUpAt));
  const upcomingDeals = deals.filter(d => isUpcoming(d.followUpAt));

  // Auto-select first non-empty tab
  const activeTab = tab;
  const tabCounts = { overdue: overdue.length + overdueDeals.length, today: today.length + todayDeals.length, upcoming: upcoming.length + upcomingDeals.length };

  const visibleContacts = activeTab === 'overdue' ? overdue : activeTab === 'today' ? today : upcoming;
  const visibleDeals = activeTab === 'overdue' ? overdueDeals : activeTab === 'today' ? todayDeals : upcomingDeals;

  const markBusy = (id: string) => setBusy(s => new Set(s).add(id));
  const clearBusy = (id: string) => setBusy(s => { const n = new Set(s); n.delete(id); return n; });

  const handleMarkDone = useCallback(async (id: string) => {
    markBusy(id);
    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followUpAt: null, lastContactedAt: new Date().toISOString() }),
      });
      if (!res.ok) { toast.error("Couldn't update that. Try again."); return; }
      setContacts(prev => prev.filter(c => c.id !== id));
      toast.success('Follow-up done.');
    } catch { toast.error("Couldn't update that. Try again."); }
    finally { clearBusy(id); }
  }, []);

  const handleSnooze = useCallback(async (id: string, hours: number, isDeal = false) => {
    markBusy(id);
    setSnoozeOpen(null);
    const newDate = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    try {
      const endpoint = isDeal ? `/api/deals/${id}` : `/api/contacts/${id}`;
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followUpAt: newDate }),
      });
      if (!res.ok) { toast.error("Couldn't snooze that. Try again."); return; }
      if (isDeal) {
        setDeals(prev => prev.map(d => d.id === id ? { ...d, followUpAt: newDate } : d));
      } else {
        setContacts(prev => prev.map(c => c.id === id ? { ...c, followUpAt: newDate } : c));
      }
      toast.success('Snoozed.');
    } catch { toast.error("Couldn't snooze that. Try again."); }
    finally { clearBusy(id); }
  }, []);

  const handleMarkDealDone = useCallback(async (id: string) => {
    markBusy(id);
    try {
      const res = await fetch(`/api/deals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followUpAt: null }),
      });
      if (!res.ok) { toast.error("Couldn't update that. Try again."); return; }
      setDeals(prev => prev.filter(d => d.id !== id));
      toast.success('Follow-up done.');
    } catch { toast.error("Couldn't update that. Try again."); }
    finally { clearBusy(id); }
  }, []);

  const totalCount = contacts.length + deals.length;
  const overdueCount = overdue.length + overdueDeals.length;

  if (totalCount === 0) {
    return (
      <div className="space-y-6 max-w-[900px]">
        <header className="space-y-1.5">
          <p className="text-sm text-muted-foreground">Follow-ups.</p>
          <h1 className={H1} style={TITLE_FONT}>Nothing due.</h1>
          <p className="text-sm text-muted-foreground">You&apos;re all caught up — quiet day.</p>
        </header>
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
          <p className="text-sm text-foreground">Nothing to chase.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Set a follow-up from any person or deal and it&apos;ll land here.
          </p>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'overdue', label: 'Overdue', count: tabCounts.overdue },
    { key: 'today', label: 'Today', count: tabCounts.today },
    { key: 'upcoming', label: 'Upcoming', count: tabCounts.upcoming },
  ];

  return (
    <div className="space-y-6 max-w-[900px]">
      <header className="space-y-1.5">
        <p className="text-sm text-muted-foreground">Follow-ups.</p>
        <h1 className={H1} style={TITLE_FONT}>
          {overdueCount > 0 ? `${overdueCount} overdue.` : 'On schedule.'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {overdueCount > 0
            ? `${overdueCount} ${overdueCount === 1 ? 'contact or deal' : 'contacts and deals'} past due.`
            : `${totalCount} ${totalCount === 1 ? 'follow-up' : 'follow-ups'} scheduled.`}
        </p>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-1.5 text-sm font-medium rounded-md transition-colors relative',
              activeTab === t.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span className={cn(
                'ml-1.5 inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums',
                t.key === 'overdue' && t.count > 0
                  ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                  : 'bg-muted text-muted-foreground'
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Contact follow-ups */}
      {visibleContacts.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-1 pb-1">
            Contacts
          </p>
          <div className="rounded-xl border border-border/70 divide-y divide-border/60 bg-card">
            {visibleContacts.map(contact => {
              const isBusy = busy.has(contact.id);
              const overdueBool = isOverdue(contact.followUpAt);
              return (
                <div key={contact.id} className={cn('flex items-center gap-3 px-4 py-3 transition-opacity', isBusy && 'opacity-50')}>
                  {/* Avatar */}
                  <div className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0',
                    overdueBool
                      ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                      : 'bg-primary/10 text-primary'
                  )}>
                    {contact.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/s/${slug}/contacts/${contact.id}`}
                        className="text-sm font-medium hover:text-primary transition-colors truncate"
                      >
                        {contact.name}
                      </Link>
                      {contact.scoreLabel && (
                        <span className={cn('text-[10px] font-semibold rounded px-1.5 py-0.5 capitalize', getScoreBadge(contact.scoreLabel))}>
                          {contact.scoreLabel}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                        {contact.type === 'QUALIFICATION' ? 'Qual' : contact.type === 'TOUR' ? 'Tour' : 'App'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {contact.phone && (
                        <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                          <Phone size={10} /> {contact.phone}
                        </a>
                      )}
                      {contact.email && (
                        <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground truncate max-w-[180px]">
                          <Mail size={10} /> {contact.email}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Date badge */}
                  <span className={cn(
                    'text-[11px] font-semibold rounded-md px-2 py-0.5 flex-shrink-0 hidden sm:inline',
                    overdueBool
                      ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                  )}>
                    {formatDate(contact.followUpAt)}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Snooze dropdown */}
                    <div className="relative" data-snooze-dropdown>
                      <button
                        type="button"
                        title="Snooze"
                        disabled={isBusy}
                        onClick={() => setSnoozeOpen(snoozeOpen === contact.id ? null : contact.id)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/15 transition-colors"
                      >
                        <Timer size={14} />
                      </button>
                      {snoozeOpen === contact.id && (
                        <div className="absolute right-0 top-8 z-20 bg-popover border border-border rounded-lg shadow-lg py-1 w-36">
                          {SNOOZE_OPTIONS.map(opt => (
                            <button
                              key={opt.hours}
                              onClick={() => handleSnooze(contact.id, opt.hours)}
                              className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Mark done */}
                    <button
                      type="button"
                      title="Mark done"
                      disabled={isBusy}
                      onClick={() => handleMarkDone(contact.id)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/15 transition-colors"
                    >
                      <CheckCircle2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Deal follow-ups */}
      {visibleDeals.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-1 pb-1">
            Deals
          </p>
          <div className="rounded-xl border border-border/70 divide-y divide-border/60 bg-card">
            {visibleDeals.map(deal => {
              const isBusy = busy.has(deal.id);
              const overdueBool = isOverdue(deal.followUpAt);
              return (
                <div key={deal.id} className={cn('flex items-center gap-3 px-4 py-3 transition-opacity', isBusy && 'opacity-50')}>
                  <div className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
                    overdueBool
                      ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                      : 'bg-primary/10 text-primary'
                  )}>
                    <Briefcase size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/s/${slug}/deals/${deal.id}`} className="text-sm font-medium hover:text-primary transition-colors truncate block">
                      {deal.title}
                    </Link>
                    {deal.address && <p className="text-[11px] text-muted-foreground truncate">{deal.address}</p>}
                  </div>
                  <span className={cn(
                    'text-[11px] font-semibold rounded-md px-2 py-0.5 flex-shrink-0 hidden sm:inline',
                    overdueBool
                      ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                  )}>
                    {formatDate(deal.followUpAt)}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <div className="relative" data-snooze-dropdown>
                      <button
                        type="button"
                        title="Snooze"
                        disabled={isBusy}
                        onClick={() => setSnoozeOpen(snoozeOpen === `deal-${deal.id}` ? null : `deal-${deal.id}`)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/15 transition-colors"
                      >
                        <Timer size={14} />
                      </button>
                      {snoozeOpen === `deal-${deal.id}` && (
                        <div className="absolute right-0 top-8 z-20 bg-popover border border-border rounded-lg shadow-lg py-1 w-36">
                          {SNOOZE_OPTIONS.map(opt => (
                            <button
                              key={opt.hours}
                              onClick={() => handleSnooze(deal.id, opt.hours, true)}
                              className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
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
                      onClick={() => handleMarkDealDone(deal.id)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/15 transition-colors"
                    >
                      <CheckCircle2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {visibleContacts.length === 0 && visibleDeals.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No {activeTab} follow-ups</p>
        </div>
      )}
    </div>
  );
}
