'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Circle,
  Link2,
  Settings,
  Users,
  MessageCircle,
  CalendarDays,
  X,
  Rocket,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

interface OnboardingChecklistProps {
  slug: string;
  hasLeads: boolean;
  hasContacts: boolean;
  hasTours: boolean;
  hasDeals: boolean;
}

type Step = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  completed: boolean;
};

// NOTE: Dismiss state is stored in localStorage only, so it resets on new
// devices / cleared storage. A proper fix would persist this to the DB
// (e.g. a `dismissedOnboardingChecklist` column on the User table), but
// that requires a schema migration. Keeping localStorage for now as a
// low-priority known limitation.
const STORAGE_KEY = 'chippi-onboarding-dismissed';

export function OnboardingChecklist({ slug, hasLeads, hasContacts, hasTours, hasDeals }: OnboardingChecklistProps) {
  const [dismissed, setDismissed] = useState(true); // Start hidden to avoid flash

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setDismissed(stored === 'true');
  }, []);

  if (dismissed) return null;

  const base = `/s/${slug}`;

  const steps: Step[] = [
    {
      id: 'share-link',
      label: 'Share your intake link',
      description: 'Send your application link to start receiving leads',
      href: base,
      icon: Link2,
      completed: hasLeads,
    },
    {
      id: 'configure',
      label: 'Customize your workspace',
      description: 'Add your business name, logo, and intake page settings',
      href: `${base}/configure`,
      icon: Settings,
      completed: false, // Can't easily detect this server-side, stays unchecked
    },
    {
      id: 'first-contact',
      label: 'Add your first client',
      description: 'Import or create your first contact',
      href: `${base}/contacts`,
      icon: Users,
      completed: hasContacts,
    },
    {
      id: 'first-tour',
      label: 'Schedule a tour',
      description: 'Book a property showing with a prospect',
      href: `${base}/calendar`,
      icon: CalendarDays,
      completed: hasTours,
    },
    {
      id: 'first-deal',
      label: 'Create your first deal',
      description: 'Track a leasing opportunity in your pipeline',
      href: `${base}/deals`,
      icon: MessageCircle,
      completed: hasDeals,
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const allDone = completedCount === steps.length;
  const progress = Math.round((completedCount / steps.length) * 100);

  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, 'true');
    setDismissed(true);
  }

  // Auto-dismiss if all steps completed
  if (allDone) {
    // Still show briefly with congrats, but user can dismiss
  }

  return (
    <Card>
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
              <Rocket size={15} className="text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {allDone ? 'You\'re all set!' : 'Get started with Chippi'}
              </p>
              <p className="text-xs text-muted-foreground">
                {allDone
                  ? 'Your workspace is fully set up.'
                  : `${completedCount} of ${steps.length} steps complete`
                }
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-1"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-muted rounded-full mb-4 overflow-hidden">
          <div
            className="h-full bg-foreground rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Steps */}
        <div className="space-y-1">
          {steps.map((step) => (
            <Link
              key={step.id}
              href={step.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors group',
                step.completed
                  ? 'opacity-60'
                  : 'hover:bg-muted/60',
              )}
            >
              {step.completed ? (
                <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              ) : (
                <Circle size={16} className="text-muted-foreground/40 flex-shrink-0 group-hover:text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm font-medium',
                  step.completed && 'line-through text-muted-foreground',
                )}>
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground truncate">{step.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
