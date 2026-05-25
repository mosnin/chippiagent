'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Bell,
  PhoneIncoming,
  CalendarDays,
  Clock,
  Users,
  AlertCircle,
  Briefcase,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { H3 } from '@/lib/typography';

interface Notification {
  id: string;
  type: string;
  title: string;
  description: string;
  href: string;
  createdAt: string;
  priority: 'high' | 'medium' | 'low';
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  new_lead: PhoneIncoming,
  upcoming_tour: CalendarDays,
  follow_up_due: Clock,
  waitlist: Users,
  tour_needs_action: Briefcase,
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-600 dark:text-red-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-muted-foreground',
};

export function NotificationCenter({ slug }: { slug: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?slug=${encodeURIComponent(slug)}`);
      if (res.ok) setNotifications(await res.json());
    } catch {
      // silent
    }
  }, [slug]);

  useEffect(() => {
    loadNotifications();
    // Fallback polling every 5 minutes (realtime handles most updates)
    const interval = setInterval(loadNotifications, 300_000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Realtime: refetch notifications when Contact or Tour changes
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    const channel = supabase
      .channel('notification-center')
      .on('postgres_changes' as any, { event: 'INSERT', schema: 'public', table: 'Contact' }, () => {
        loadNotifications();
      })
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'Tour' }, () => {
        loadNotifications();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadNotifications]);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  const highCount = notifications.filter((n) => n.priority === 'high').length;
  const totalCount = notifications.length;

  const dropdown = open && mounted ? createPortal(
    <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)}>
      <div
        className="absolute right-4 md:right-8 top-12 w-80 sm:w-96 rounded-lg border border-border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className={H3}>Notifications</span>
          <button onClick={() => setOpen(false)} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground">
            <X size={14} />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <Bell size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nothing pressing.</p>
              <p className="text-xs mt-0.5">I&apos;m watching the pipeline.</p>
            </div>
          ) : (
            <div className="py-1">
              {notifications.map((n) => {
                const Icon = TYPE_ICONS[n.type] || AlertCircle;
                return (
                  <button
                    key={n.id}
                    onClick={() => navigate(n.href)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors"
                  >
                    <div className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                      n.priority === 'high' ? 'bg-red-100 dark:bg-red-500/15' :
                      n.priority === 'medium' ? 'bg-amber-100 dark:bg-amber-500/15' :
                      'bg-muted'
                    )}>
                      <Icon size={14} className={PRIORITY_COLORS[n.priority]} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{n.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="relative h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.025] transition-colors"
        title="Notifications"
        aria-label={totalCount > 0 ? `${totalCount} notifications` : 'Notifications'}
      >
        <Bell size={14} strokeWidth={1.75} />
        {totalCount > 0 && (
          <span className={cn(
            'absolute top-1 right-1 min-w-[14px] h-3.5 rounded-full text-[9px] font-semibold flex items-center justify-center px-1 leading-none ring-2 ring-background',
            highCount > 0
              ? 'bg-orange-500 text-white'
              : 'bg-foreground/15 text-foreground/70'
          )}>
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </button>
      {dropdown}
    </>
  );
}
