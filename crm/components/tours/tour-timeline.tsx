'use client';

import { useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
  Briefcase,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimelineEvent {
  label: string;
  icon: typeof Clock;
  color: string;
  time?: string;
  active: boolean;
  completed: boolean;
}

interface TourTimelineProps {
  status: string;
  createdAt?: string;
  startsAt: string;
  googleEventId: string | null;
  sourceDealId: string | null;
  feedbackRating?: number | null;
}

export function TourTimeline({ status, createdAt, startsAt, googleEventId, sourceDealId, feedbackRating }: TourTimelineProps) {
  const [expanded, setExpanded] = useState(false);

  const events: TimelineEvent[] = [];

  // 1. Booked
  events.push({
    label: 'Booked',
    icon: CalendarDays,
    color: 'text-blue-500',
    time: createdAt ? new Date(createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : undefined,
    active: status === 'scheduled',
    completed: status !== 'scheduled',
  });

  // 2. Confirmed
  if (status !== 'cancelled') {
    events.push({
      label: 'Confirmed',
      icon: UserCheck,
      color: 'text-emerald-500',
      active: status === 'confirmed',
      completed: ['completed', 'no_show'].includes(status),
    });
  }

  // 3. Status-dependent final events
  if (status === 'completed') {
    events.push({
      label: 'Completed',
      icon: CheckCircle2,
      color: 'text-emerald-500',
      time: new Date(startsAt).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      active: !sourceDealId && feedbackRating == null,
      completed: true,
    });
    if (feedbackRating != null) {
      events.push({
        label: `Feedback (${feedbackRating}/5)`,
        icon: Star,
        color: 'text-amber-500',
        active: false,
        completed: true,
      });
    }
    if (sourceDealId) {
      events.push({
        label: 'Deal created',
        icon: Briefcase,
        color: 'text-primary',
        active: false,
        completed: true,
      });
    }
  } else if (status === 'cancelled') {
    events.push({
      label: 'Cancelled',
      icon: XCircle,
      color: 'text-red-500',
      active: true,
      completed: false,
    });
  } else if (status === 'no_show') {
    events.push({
      label: 'No show',
      icon: AlertTriangle,
      color: 'text-amber-500',
      active: true,
      completed: false,
    });
  } else {
    // Upcoming milestones for scheduled/confirmed
    events.push({
      label: 'Tour day',
      icon: Clock,
      color: 'text-muted-foreground',
      time: new Date(startsAt).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      active: false,
      completed: false,
    });
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {/* Mini dots preview */}
        <div className="flex items-center gap-0.5">
          {events.map((e, i) => (
            <span
              key={i}
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                e.completed ? 'bg-emerald-500' : e.active ? 'bg-primary' : 'bg-muted-foreground/30'
              )}
            />
          ))}
        </div>
        <span className="ml-1">{events.length} steps</span>
        {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      {expanded && (
        <div className="mt-2 pl-1 space-y-0">
          {events.map((event, i) => {
            const Icon = event.icon;
            const isLast = i === events.length - 1;
            return (
              <div key={i} className="flex items-start gap-2">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                    event.completed ? 'bg-emerald-100 dark:bg-emerald-900/30' :
                    event.active ? 'bg-primary/10' : 'bg-muted'
                  )}>
                    <Icon size={10} className={cn(event.completed ? 'text-emerald-600 dark:text-emerald-400' : event.active ? 'text-primary' : 'text-muted-foreground/50')} />
                  </div>
                  {!isLast && (
                    <div className={cn('w-px h-3', event.completed ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-border')} />
                  )}
                </div>
                <div className="flex items-center gap-2 -mt-0.5 pb-1">
                  <span className={cn(
                    'text-[11px] font-medium',
                    event.completed ? 'text-foreground' : event.active ? 'text-primary' : 'text-muted-foreground/50'
                  )}>
                    {event.label}
                  </span>
                  {event.time && (
                    <span className="text-[10px] text-muted-foreground">{event.time}</span>
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
