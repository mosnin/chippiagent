'use client';

import Link from 'next/link';
import {
  ArrowRight,
  ArrowLeft,
  Users,
  CheckCircle2,
  Zap,
  Mail,
  Phone,
  Calendar,
  StickyNote,
  MessageSquareMore,
  Link2,
  Bot,
  TrendingUp,
} from 'lucide-react';
import { Navbar } from '@/components/navbar';
import AnimatedFooter from '@/components/ui/animated-footer';

const profileSections = [
  {
    icon: Users,
    title: 'Contact profile',
    features: [
      'Full name, email, and phone number',
      'Lead tier badge (hot / warm / cold)',
      'Current pipeline stage',
      'Assigned follow-up date with overdue indicator',
      'Budget, move-in date, and target neighborhoods',
    ],
  },
  {
    icon: MessageSquareMore,
    title: 'Activity log',
    features: [
      'Chronological log of every touchpoint',
      'Note entries with timestamps',
      'Call logs with outcome notes',
      'Email send history',
      'Meeting and appointment records',
    ],
  },
  {
    icon: Mail,
    title: 'Email history',
    features: [
      'Send emails directly from the contact record',
      'Full sent email history in one view',
      'Quick email compose from any contact page',
      'No switching between tools or tabs',
    ],
  },
  {
    icon: Calendar,
    title: 'Follow-up scheduling',
    features: [
      'Set a follow-up date per contact',
      'Overdue alerts surface in your dashboard',
      'Visual due-date indicators on contact cards',
      'Quick reschedule from the contact profile',
    ],
  },
];

const stageFlow = [
  { label: 'New Lead', color: 'bg-primary' },
  { label: 'Contacted', color: 'bg-amber-500' },
  { label: 'Touring', color: 'bg-blue-500' },
  { label: 'Applied', color: 'bg-purple-500' },
  { label: 'Closed', color: 'bg-green-500' },
];

const relatedFeatures = [
  { href: '/features/intake', icon: Link2, name: 'Intake Link', description: 'Where leads enter the CRM' },
  { href: '/features/ai-scoring', icon: Bot, name: 'AI Scoring', description: 'Score visible on every profile' },
  { href: '/features/pipeline', icon: TrendingUp, name: 'Deal Pipeline', description: 'Link deals to contacts' },
];

export default function CRMPage() {
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
                <Users size={11} />
                Contact CRM
              </div>
              <h1 className="font-title text-4xl md:text-5xl font-bold tracking-tight leading-[1.08]">
                Full contact management built for leasing.
              </h1>
              <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
                Every renter who submits an intake form gets a full contact profile — with activity logs, email history, follow-up scheduling, deal tracking, and a complete view of their journey from inquiry to close.
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

        {/* Profile sections */}
        <section className="px-6 py-20 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">What&apos;s on every profile</p>
            <h2 className="text-3xl font-semibold tracking-tight mb-10">
              One view for everything you need to act.
            </h2>
            <div className="grid sm:grid-cols-2 gap-5">
              {profileSections.map((s) => (
                <div
                  key={s.title}
                  className="rounded-xl border border-border bg-card p-6 shadow-[0_1px_4px_rgba(0,0,0,0.05)]"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 text-primary">
                      <s.icon size={16} />
                    </div>
                    <h3 className="font-semibold">{s.title}</h3>
                  </div>
                  <ul className="space-y-2.5">
                    {s.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 size={13} className="text-primary flex-shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stage flow */}
        <section className="px-6 py-20 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Contact stages</p>
                <h2 className="text-3xl font-semibold tracking-tight mb-5">
                  Move contacts through your workflow.
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Each contact has a current stage that reflects where they are in your leasing workflow. Update it in one click and watch your pipeline view stay current automatically.
                </p>
                <ul className="mt-6 space-y-3">
                  {[
                    'Stage updates visible across the dashboard',
                    'Filter and sort contacts by stage',
                    'Pipeline analytics roll up from contact stages',
                    'Linked to any associated deals',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-border bg-card p-8 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-5">Contact stages</p>
                <div className="space-y-2">
                  {stageFlow.map((stage, i) => (
                    <div key={stage.label} className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${stage.color}`} />
                      <div className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium">
                        {stage.label}
                      </div>
                      {i < stageFlow.length - 1 && (
                        <ArrowRight size={13} className="text-muted-foreground/40 flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Quick actions highlight */}
        <section className="px-6 py-20 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <div className="rounded-2xl border border-border bg-card p-8 md:p-10 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Quick actions</p>
              <h2 className="text-2xl font-semibold tracking-tight mb-8">
                Act from the contact record — no switching tabs.
              </h2>
              <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { icon: Mail, label: 'Send email', sub: 'Compose and send directly' },
                  { icon: Phone, label: 'Log a call', sub: 'Add call notes instantly' },
                  { icon: StickyNote, label: 'Add note', sub: 'Quick context entry' },
                  { icon: Calendar, label: 'Set follow-up', sub: 'Schedule next touchpoint' },
                ].map((action) => (
                  <div
                    key={action.label}
                    className="flex flex-col items-center text-center rounded-xl border border-border bg-background px-4 py-5"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/8 text-primary mb-3">
                      <action.icon size={18} />
                    </div>
                    <p className="text-sm font-semibold">{action.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">{action.sub}</p>
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
              Every renter, fully managed.
            </h2>
            <p className="mt-5 text-muted-foreground text-lg">
              Stop losing context across scattered notes and DMs. Start your free trial today.
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
