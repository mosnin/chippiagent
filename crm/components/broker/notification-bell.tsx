'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, UserPlus, Briefcase, Flame, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
}

const typeIcon: Record<string, typeof Bell> = {
  member_joined: UserPlus,
  member_removed: UserPlus,
  deal_won: Briefcase,
  deal_created: Briefcase,
  lead_hot: Flame,
};

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/broker/notifications', { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setNotifications(d.notifications ?? []))
      .catch((err) => { if (err.name !== 'AbortError') setNotifications([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function markAllRead() {
    await fetch('/api/broker/notifications', { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function handleToggle() {
    setOpen((o) => !o);
    if (!open && unread > 0) {
      markAllRead();
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleToggle}
        className="relative p-2 rounded-lg hover:bg-muted transition-colors"
        title="Notifications"
      >
        <Bell size={16} className="text-muted-foreground" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 rounded-xl border border-border bg-card shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-sm font-semibold">Notifications</p>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">No notifications yet</div>
            ) : (
              notifications.map((n) => {
                const Icon = typeIcon[n.type] ?? Bell;
                const timeAgo = getTimeAgo(n.createdAt);
                return (
                  <div
                    key={n.id}
                    className={cn(
                      'px-4 py-3 border-b border-border last:border-0 flex gap-3',
                      !n.read && 'bg-primary/5'
                    )}
                  >
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon size={13} className="text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium leading-snug">{n.title}</p>
                      {n.body && <p className="text-[11px] text-muted-foreground mt-0.5">{n.body}</p>}
                      <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
