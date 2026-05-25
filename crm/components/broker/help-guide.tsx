'use client';

import { useState } from 'react';
import { HelpCircle, Users, BarChart3, Mail, Settings, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const steps = [
  {
    icon: BarChart3,
    title: 'Team Overview',
    description:
      'Your dashboard shows real-time pipeline stats, conversion funnels, and weekly trends across your entire brokerage. Use it to monitor total leads, applications, deals, and closed value at a glance.',
  },
  {
    icon: Users,
    title: 'Manage Realtors',
    description:
      'Visit the Realtors page to see individual performance metrics for each team member. You can sort and filter by leads, deals, pipeline value, and more to identify top performers.',
  },
  {
    icon: Mail,
    title: 'Invite Team Members',
    description:
      'Go to Invitations to send email invites or share an invite code. You can invite realtors one by one, or use bulk CSV upload to onboard your whole team at once.',
  },
  {
    icon: Settings,
    title: 'Brokerage Settings',
    description:
      'Customize your brokerage name, website URL, and logo from the Settings page. These details appear across your team\'s dashboards and in client-facing communications.',
  },
];

export function BrokerHelpGuide() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const Icon = current.icon;

  function handleOpen() {
    setStep(0);
    setOpen(true);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleOpen}
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        aria-label="Help guide"
      >
        <HelpCircle size={15} />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon size={16} className="text-primary" />
              </div>
              {current.title}
            </DialogTitle>
            <DialogDescription className="pt-2 text-sm leading-relaxed">
              {current.description}
            </DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-1.5 pt-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === step ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/20'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            {!isLast ? (
              <Button onClick={() => setStep(step + 1)} className="w-full">
                Next
                <ArrowRight size={14} className="ml-1.5" />
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setOpen(false);
                    window.open('https://chippi.io/help', '_blank');
                  }}
                >
                  More Help
                </Button>
                <Button className="w-full" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </>
            )}
          </div>

          {/* Back link on non-first steps */}
          {step > 0 && !isLast && (
            <button
              onClick={() => setStep(step - 1)}
              className="text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
            >
              Back
            </button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
