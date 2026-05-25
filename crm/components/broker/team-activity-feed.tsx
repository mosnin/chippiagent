'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Activity } from 'lucide-react';
import { timeAgo } from '@/lib/formatting';

interface ActivityItem {
  id: string;
  type: 'lead' | 'deal' | 'tour';
  actor: string;
  action: string;
  entity: string;
  timestamp: string;
}

const DOT_COLORS: Record<ActivityItem['type'], string> = {
  lead: 'bg-emerald-500',
  deal: 'bg-blue-500',
  tour: 'bg-amber-500',
};

export function TeamActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/broker/team-activity', { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setActivities(d.activities ?? []))
      .catch((err) => { if (err.name !== 'AbortError') setActivities([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="px-5 py-5 space-y-3">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-primary" />
            <p className="text-sm font-semibold">Team Activity</p>
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="mt-1.5 h-2 w-2 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 bg-muted/30 animate-pulse rounded" />
                <div className="h-2.5 w-1/3 bg-muted/20 animate-pulse rounded" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardContent className="px-5 py-5 space-y-3">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-primary" />
            <p className="text-sm font-semibold">Team Activity</p>
          </div>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Activity size={28} className="mb-2 opacity-30" />
            <p className="text-sm">No recent activity yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="px-5 py-5 space-y-3">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-primary" />
          <p className="text-sm font-semibold">Team Activity</p>
        </div>
        <div className="max-h-[340px] overflow-y-auto -mr-2 pr-2 space-y-3">
          {activities.map((item) => (
            <div key={item.id} className="flex items-start gap-3">
              <div
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_COLORS[item.type]}`}
              />
              <p className="text-sm leading-snug">
                <span className="font-medium">{item.actor}</span>{' '}
                <span className="text-muted-foreground">{item.action}</span>{' '}
                <span className="font-medium">{item.entity}</span>
                <span className="text-muted-foreground">
                  {' '}&mdash; {timeAgo(item.timestamp)}
                </span>
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
