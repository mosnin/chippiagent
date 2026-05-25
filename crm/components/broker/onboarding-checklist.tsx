'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Circle,
  Users,
  Settings,
  BarChart3,
  FileDown,
  X,
  Rocket,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

interface BrokerOnboardingChecklistProps {
  hasMembers: boolean;
  hasInvitations: boolean;
  hasSettings: boolean;
}

type Step = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  completed: boolean;
};

const STORAGE_KEY = 'broker-onboarding-dismissed';

export function BrokerOnboardingChecklist({ hasMembers, hasInvitations, hasSettings }: BrokerOnboardingChecklistProps) {
  const [dismissed, setDismissed] = useState(true); // Start hidden to avoid flash

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setDismissed(stored === 'true');
  }, []);

  if (dismissed) return null;

  const steps: Step[] = [
    {
      id: 'invite-realtor',
      label: 'Invite your first realtor',
      description: 'Send an invitation to add a realtor to your brokerage',
      href: '/broker/invitations',
      icon: Users,
      completed: hasMembers || hasInvitations,
    },
    {
      id: 'configure-settings',
      label: 'Configure brokerage settings',
      description: 'Set your brokerage name, logo, and preferences',
      href: '/broker/settings',
      icon: Settings,
      completed: hasSettings,
    },
    {
      id: 'review-performance',
      label: 'Review team performance',
      description: 'View metrics and activity across your realtors',
      href: '/broker/realtors',
      icon: BarChart3,
      completed: false,
    },
    {
      id: 'export-report',
      label: 'Export your first report',
      description: 'Download a CSV report of your brokerage data',
      href: '/api/broker/export',
      icon: FileDown,
      completed: false,
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
    localStorage.setItem(STORAGE_KEY, 'true');
  }

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Rocket size={15} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {allDone ? 'You\'re all set!' : 'Get started with your brokerage'}
              </p>
              <p className="text-xs text-muted-foreground">
                {allDone
                  ? 'Your brokerage is fully set up.'
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
            className="h-full bg-primary rounded-full transition-all duration-500"
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
                <CheckCircle2 size={16} className="text-primary flex-shrink-0" />
              ) : (
                <Circle size={16} className="text-muted-foreground/40 flex-shrink-0 group-hover:text-primary/60" />
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
