'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { Info, AlertTriangle, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Announcement = {
  id: string;
  title: string | null;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  linkUrl: string | null;
  linkLabel: string | null;
  dismissible: boolean;
};

const STYLES: Record<Announcement['severity'], { strip: string; icon: React.ElementType; iconColor: string }> = {
  info: {
    strip: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-200',
    icon: Info,
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  warning: {
    strip: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200',
    icon: AlertTriangle,
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  critical: {
    strip: 'bg-red-50 border-red-200 text-red-900 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-200',
    icon: AlertCircle,
    iconColor: 'text-red-600 dark:text-red-400',
  },
};

export function PlatformBanner() {
  const { isSignedIn, isLoaded } = useUser();
  const [items, setItems] = useState<Announcement[]>([]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    fetch('/api/platform/announcements')
      .then((r) => (r.ok ? r.json() : { announcements: [] }))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.announcements)) {
          setItems(data.announcements);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  function handleDismiss(id: string) {
    // Optimistic removal
    setItems((prev) => prev.filter((a) => a.id !== id));
    fetch('/api/platform/announcements/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ announcementId: id }),
    }).catch(() => {});
  }

  if (!isSignedIn || items.length === 0) return null;

  return (
    <div className="sticky top-0 z-[60] flex flex-col">
      {items.map((a) => {
        const s = STYLES[a.severity];
        const Icon = s.icon;
        return (
          <div
            key={a.id}
            className={cn('w-full border-b px-4 py-2.5 flex items-start gap-3', s.strip)}
            role="status"
          >
            <Icon size={16} className={cn('flex-shrink-0 mt-0.5', s.iconColor)} />
            <div className="flex-1 min-w-0 text-sm">
              {a.title && <span className="font-semibold mr-1.5">{a.title}</span>}
              <span>{a.message}</span>
              {a.linkUrl && (
                <Link
                  href={a.linkUrl}
                  className="ml-2 inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:opacity-80"
                >
                  {a.linkLabel || 'Learn more'}
                </Link>
              )}
            </div>
            {a.dismissible && (
              <button
                type="button"
                onClick={() => handleDismiss(a.id)}
                className="flex-shrink-0 -mr-1 p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                aria-label="Dismiss announcement"
              >
                <X size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
