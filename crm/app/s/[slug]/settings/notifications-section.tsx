'use client';

import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  BODY,
  BODY_MUTED,
  CAPTION,
  PRIMARY_PILL,
} from '@/lib/typography';

interface NotificationsSectionProps {
  slug: string;
}

/**
 * One toggle. Email me when something happens, or don't. Cadence, channels,
 * and per-event filters were all the team failing to pick a default. The
 * default is: when a real lead/tour/deal lands, you want to know.
 */
export function NotificationsSection({ slug }: NotificationsSectionProps) {
  const [notifications, setNotifications] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/spaces?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        const s = data.settings ?? data;
        setNotifications(s.notifications ?? true);
        setUserEmail(data.ownerEmail ?? data.email ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/spaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, notifications }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Could not save.');
      }
      setSaved(true);
      toast.success('Notifications saved.');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That tripped me up. Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="h-20 bg-foreground/[0.04] rounded-md animate-pulse" />;
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="min-w-0">
          <p className={`${BODY} font-medium`}>Email me when something happens</p>
          <p className={`${CAPTION} mt-0.5`}>
            New leads, tour bookings, follow-ups due. Sent to{' '}
            <span className="text-foreground">{userEmail || 'your account email'}</span>.
          </p>
        </div>
        <Switch checked={notifications} onCheckedChange={setNotifications} />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className={cn(PRIMARY_PILL, 'disabled:opacity-60 disabled:cursor-not-allowed')}
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? 'Saving' : saved ? 'Saved' : 'Save changes'}
        </button>
        {saved && <p className={BODY_MUTED}>Changes saved.</p>}
      </div>
    </form>
  );
}
