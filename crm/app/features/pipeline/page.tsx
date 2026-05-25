'use client';

import Link from 'next/link';
import {
  ArrowRight,
  ArrowLeft,
  TrendingUp,
  CheckCircle2,
  Zap,
  Users,
  Bot,
  BarChart3,
  DollarSign,
  Calendar,
  StickyNote,
  Layers,
} from 'lucide-react';
import { Navbar } from '@/components/navbar';
import AnimatedFooter from '@/components/ui/animated-footer';

const pipelineStages = [
  { label: 'New Inquiry', count: 12, color: 'bg-primary' },
  { label: 'Contacted', count: 8, color: 'bg-amber-500' },
  { label: 'Touring', count: 5, color: 'bg-blue-500' },
  { label: 'Application Sent', count: 3, color: 'bg-purple-500' },
  { label: 'Closed Won', count: 2, color: 'bg-green-500' },
];

const dealFeatures = [
  {
    icon: DollarSign,
    title: 'Deal value tracking',
    description: 'Record expected lease value or commission on every deal. Total pipeline value rolls up automatically.',
  },
  {
    icon: Calendar,
    title: 'Expected close dates',
    description: 'Set a close date per deal. Overdue deals surface at the top of your view so nothing slips.',
  },
  {
    icon: Users,
    title: 'Linked to contacts',
    description: 'Every deal is linked to a contact record. Navigate between the deal and the full contact profile in one click.',
  },
  {
    icon: StickyNote,
    title: 'Deal activity log',
    description: 'Add notes, log calls, and track every update directly on the deal record — separate from the contact log.',
  },
  {
    icon: Layers,
    title: 'Kanban board view',
    description: 'Drag and drop deals between stages. Your pipeline always reflects your current state at a glance.',
  },
  {
    icon: TrendingUp,
    title: 'Pipeline analytics',
    description: 'Stage distribution, total deal value, and close rate all flow into your analytics dashboard automatically.',
  },
];

const workflowSteps = [
  {
    step: '01',
    title: 'Create a deal',
    body: 'Attach a deal to any contact. Set the stage, expected value, and close date to get it into your pipeline.',
  },
  {
    step: '02',
    title: 'Move through stages',
    body: 'Drag deals across your kanban board as they progress. Stages are customizable to match your workflow.',
  },
  {
    step: '03',
    title: 'Log activity',
    body: 'Add notes, calls, and updates directly on the deal. Full history stays attached to the record.',
  },
  {
    step: '04',
    title: 'Track to close',
    body: 'Watch overdue deals surface automatically. Close dates keep your pipeline honest and your follow-up on time.',
  },
];

const relatedFeatures = [
  { href: '/features/crm', icon: Users, name: 'Contact CRM', description: 'Deals link to contact profiles' },
  { href: '/features/ai-scoring', icon: Bot, name: 'AI Scoring', description: 'Prioritize which leads become deals' },
  { href: '/features/analytics', icon: BarChart3, name: 'Analytics', description: 'Pipeline value and close rates' },
];

export default function PipelinePage() {
  return (
    <div className="min-h-svh w-full bg-background text-foreground">
      <Navbar />
      <main className="relative overflow-x-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(20,184,166,0.1),transparent_70%)]" />

        {/* Hero */}
        <section className="px-6 pt-36 pb-16">
          <div className="max-w-5xl mx-auto">
            <Link
              href="/features"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
            >
              <ArrowLeft size={14} /> All features
            </Link>

            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary mb-5">
                <TrendingUp size={11} />
                Deal Pipeline
              </div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-[1.08]">
                A deal pipeline built for the way leasing works.
              </h1>
              <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
                Track every deal from first inquiry to signed lease with a kanban board, stage tracking, close dates, deal values, and full activity history — all linked to your contacts.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/sign-up"
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-full font-semibold hover:opacity-90 transition-opacity"
                >
                  Start free trial <ArrowRight size={15} />
                </Link>
                <Link
                  href="/features"
                  className="inline-flex items-center gap-2 border border-border px-6 py-3 rounded-full font-medium hover:bg-card transition-colors"
                >
                  View all features
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Kanban preview */}
        <section className="px-6 py-20 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Pipeline view</p>
            <h2 className="text-3xl font-semibold tracking-tight mb-10">
              Your full pipeline at a glance.
            </h2>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-x-auto">
              <div className="flex gap-3 min-w-max">
                {pipelineStages.map((stage) => (
                  <div key={stage.label} className="w-48">
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${stage.color}`} />
                      <p className="text-xs font-semibold text-foreground truncate">{stage.label}</p>
                      <span className="ml-auto text-xs text-muted-foreground font-medium bg-muted rounded-full px-1.5 py-0.5">
                        {stage.count}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {Array.from({ length: Math.min(stage.count, 2) }, (_, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-border bg-background p-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                        >
                          <div className="h-2.5 w-3/4 rounded bg-muted mb-2" />
                          <div className="h-2 w-1/2 rounded bg-muted" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Deal features grid */}
        <section className="px-6 py-20 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Deal features</p>
            <h2 className="text-3xl font-semibold tracking-tight mb-10">
              Everything on a deal record.
            </h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {dealFeatures.map((f) => (
                <div
                  key={f.title}
                  className="rounded-xl border border-border bg-card px-5 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.05)]"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 text-primary mb-4">
                    <f.icon size={16} />
                  </div>
                  <h3 className="font-semibold text-sm mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="px-6 py-20 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Workflow</p>
            <h2 className="text-3xl font-semibold tracking-tight mb-10">
              From lead to lease in four steps.
            </h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
              {workflowSteps.map((s) => (
                <div
                  key={s.step}
                  className="rounded-xl border border-border bg-card px-5 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.05)]"
                >
                  <p className="text-2xl font-bold text-primary/20">{s.step}</p>
                  <p className="mt-3 font-semibold text-sm leading-snug">{s.title}</p>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What you can track */}
        <section className="px-6 py-20 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <div className="rounded-2xl border border-primary/20 bg-card p-8 md:p-10 shadow-[0_4px_24px_-8px_rgba(13,148,136,0.2)]">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">What you can track</p>
              <h2 className="text-2xl font-semibold tracking-tight mb-8">The complete deal picture.</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  'Current pipeline stage per deal',
                  'Total pipeline value across all active deals',
                  'Expected close dates with overdue alerts',
                  'Linked contact for each deal',
                  'Deal-specific activity and note history',
                  'Closed vs. lost deal tracking',
                  'Stage conversion rates over time',
                  'Average deal size and close velocity',
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-4 py-3"
                  >
                    <CheckCircle2 size={13} className="text-primary flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Related */}
        <section className="px-6 py-16 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-6">Works with</p>
            <div className="grid sm:grid-cols-3 gap-4">
              {relatedFeatures.map((f) => (
                <Link
                  key={f.href}
                  href={f.href}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 hover:-translate-y-px transition-transform shadow-[0_1px_4px_rgba(0,0,0,0.05)]"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 text-primary flex-shrink-0 group-hover:bg-primary/15 transition-colors">
                    <f.icon size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{f.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
                  </div>
                  <ArrowRight size={13} className="ml-auto text-muted-foreground/0 group-hover:text-muted-foreground flex-shrink-0 transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 px-6 border-t border-border">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-4 py-1.5 text-xs font-semibold text-primary mb-6">
              <Zap size={12} />
              7-day free trial — no card required
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Run a tighter leasing pipeline.
            </h2>
            <p className="mt-5 text-muted-foreground text-lg">
              Start your free trial and track every deal from first inquiry to close.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3.5 rounded-full font-semibold hover:opacity-90 transition-opacity shadow-sm"
              >
                Start free trial <ArrowRight size={16} />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 border border-border px-8 py-3.5 rounded-full font-medium hover:bg-card transition-colors"
              >
                View pricing <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>

        <AnimatedFooter
          leftLinks={[
            { href: '/features', label: 'Features' },
            { href: '/pricing', label: 'Pricing' },
            { href: '/faq', label: 'FAQ' },
            { href: '/sign-up', label: 'Get started' },
          ]}
          rightLinks={[
            { href: '/legal/privacy', label: 'Privacy' },
            { href: '/legal/terms', label: 'Terms' },
            { href: '/legal/cookies', label: 'Cookies' },
            { href: '/login/realtor', label: 'Log in' },
          ]}
          copyrightText={`© ${new Date().getFullYear()} Chippi. Leasing workflow clarity for modern realtors.`}
        />
      </main>
    </div>
  );
}
