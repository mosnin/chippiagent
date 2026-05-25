'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Link2,
  MessageSquareMore,
  BarChart3,
  Users,
  Phone,
  Mail,
  Calendar,
  MessageCircle,
  Zap,
  TrendingUp,
  StickyNote,
} from 'lucide-react';
import { Navbar } from '@/components/navbar';
import AnimatedFooter from '@/components/ui/animated-footer';
import {
  AnimatedCard,
  CardVisual,
  CardBody,
  CardTitle,
  CardDescription,
  Visual3,
} from '@/components/ui/animated-card-chart';
import {
  AnimatedCard as AnimatedCard2,
  CardVisual as CardVisual2,
  CardBody as CardBody2,
  CardTitle as CardTitle2,
  CardDescription as CardDescription2,
  Visual2,
} from '@/components/ui/animated-card-diagram';
import {
  AnimatedCard as AnimatedCard3,
  CardVisual as CardVisual3,
  CardBody as CardBody3,
  CardTitle as CardTitle3,
  CardDescription as CardDescription3,
  Visual1,
} from '@/components/ui/animated-card-line';

const featureSections = [
  {
    tag: 'Intake',
    title: 'One link. Every inquiry.',
    description:
      'Share a single intake link and every renter fills out the same structured form. No DMs to parse, no sticky notes — just clean lead records from the moment they submit.',
    visual: 'line',
    features: [
      'Custom-branded intake form with your workspace',
      'Captures budget, move-in date, neighborhoods & household size',
      'Every submission creates a structured lead record instantly',
      'Works from bio links, listing replies, and email signatures',
      'No login required for renters — frictionless entry',
    ],
  },
  {
    tag: 'AI Scoring',
    title: 'Know who to call first.',
    description:
      'Every submission is scored across multiple qualification signals — budget fit, timeline, neighborhood match, and household criteria. Context is always attached so you understand the score.',
    visual: 'diagram',
    features: [
      'Multi-signal scoring on every submission',
      'Hot / warm / cold / unscored tiers at a glance',
      'Plain-language scoring summary attached to each lead',
      'Re-score anytime as details change',
      'Priority ranking updates automatically across your pipeline',
    ],
  },
  {
    tag: 'CRM',
    title: 'Full contact management.',
    description:
      "More than a lead list — Chippi gives you full contact profiles with activity logs, email history, deal tracking, follow-up scheduling, and a complete view of each renter's journey.",
    visual: null,
    features: [
      'Contact profiles with all intake context in one view',
      'Activity log: calls, notes, emails, meetings, and follow-ups',
      'Send emails directly from each contact record',
      'Deal and pipeline stage tracking per contact',
      'Follow-up date scheduling with overdue alerts',
    ],
  },
  {
    tag: 'Pipeline',
    title: 'Deals from inquiry to close.',
    description:
      'Create and manage deals linked to contacts and pipeline stages. Drag-and-drop kanban board, deal values, close dates, and full activity tracking — built for how leasing actually works.',
    visual: null,
    features: [
      'Kanban board with customizable pipeline stages',
      'Deal value and expected close date tracking',
      'Link deals directly to contact records',
      'Activity log per deal for notes and updates',
      'Filter by stage, value, and assigned contact',
    ],
  },
  {
    tag: 'Analytics',
    title: 'See the full picture.',
    description:
      'Track your lead volume, qualification rates, conversion trends, and pipeline health in one dashboard. Know what\'s working before your competitors do.',
    visual: 'chart',
    features: [
      'Lead volume and intake trends over time',
      'Qualified vs. disqualified conversion ratios',
      'Pipeline stage distribution at a glance',
      'Average time-to-follow-up metrics',
      'Deal value and close rate tracking',
    ],
  },
];

const allFeatures = [
  { icon: Link2, label: 'Custom intake link' },
  { icon: ClipboardList, label: 'Structured lead capture' },
  { icon: Bot, label: 'AI lead scoring' },
  { icon: Gauge, label: 'Priority tiers' },
  { icon: Users, label: 'Contact CRM' },
  { icon: BarChart3, label: 'Analytics dashboard' },
  { icon: MessageSquareMore, label: 'Activity log' },
  { icon: Mail, label: 'In-app email' },
  { icon: Phone, label: 'Call logging' },
  { icon: StickyNote, label: 'Notes & follow-ups' },
  { icon: Calendar, label: 'Follow-up scheduling' },
  { icon: TrendingUp, label: 'Deal pipeline' },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-svh w-full bg-background text-foreground">
      <Navbar />
      <main className="relative overflow-x-hidden">
        {/* Hero glow */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(20,184,166,0.1),transparent_70%)]" />

        {/* Page hero */}
        <section className="px-6 pt-36 pb-20 text-center">
          <div className="mx-auto max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-4 py-1.5 text-xs font-semibold text-primary mb-6">
              <MessageCircle size={12} />
              Built for solo realtors
            </div>
            <h1 className="font-title text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
              Everything you need to run your leasing workflow.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              From the first renter inquiry to signed lease — Chippi gives you intake, qualification, scoring, CRM, and analytics in one lightweight tool.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3.5 rounded-full font-semibold hover:opacity-90 transition-opacity"
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

        {/* Feature grid overview */}
        <section className="px-6 py-16 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-8 text-center">What&apos;s included</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {allFeatures.map((f) => (
                <div
                  key={f.label}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                >
                  <f.icon size={16} className="text-primary flex-shrink-0" />
                  <span className="text-sm font-medium">{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Detailed feature sections */}
        {featureSections.map((section, idx) => (
          <section key={section.tag} className="py-20 px-6 border-t border-border">
            <div className="max-w-5xl mx-auto">
              {/* Visual feature cards for specific sections */}
              {section.visual ? (
                <div className="rounded-xl border border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] overflow-hidden mb-8">
                  <div className={`grid md:grid-cols-2 ${idx % 2 === 1 ? '' : ''}`}>
                    {section.visual === 'line' && (
                      <>
                        <AnimatedCard3 className="rounded-none border-0 border-r border-border shadow-none">
                          <CardVisual3>
                            <Visual1 mainColor="#14b8a6" secondaryColor="#0d9488" />
                          </CardVisual3>
                          <CardBody3>
                            <CardTitle3>Intake pipeline over time</CardTitle3>
                            <CardDescription3>Hover to see weekly qualification volume.</CardDescription3>
                          </CardBody3>
                        </AnimatedCard3>
                        <div className="flex flex-col justify-center px-6 py-8 md:px-8">
                          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary w-fit mb-4">
                            {section.tag}
                          </div>
                          <h2 className="text-2xl font-semibold tracking-tight">{section.title}</h2>
                          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{section.description}</p>
                          <ul className="mt-5 space-y-2.5">
                            {section.features.map((f) => (
                              <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                                <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                                {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </>
                    )}
                    {section.visual === 'diagram' && (
                      <>
                        <div className="flex flex-col justify-center px-6 py-8 md:px-8">
                          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary w-fit mb-4">
                            {section.tag}
                          </div>
                          <h2 className="text-2xl font-semibold tracking-tight">{section.title}</h2>
                          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{section.description}</p>
                          <ul className="mt-5 space-y-2.5">
                            {section.features.map((f) => (
                              <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                                <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                                {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <AnimatedCard2 className="rounded-none border-0 border-l border-border shadow-none">
                          <CardVisual2>
                            <Visual2 mainColor="#14b8a6" secondaryColor="#0d9488" />
                          </CardVisual2>
                          <CardBody2>
                            <CardTitle2>AI qualification breakdown</CardTitle2>
                            <CardDescription2>Hover to reveal scoring signals.</CardDescription2>
                          </CardBody2>
                        </AnimatedCard2>
                      </>
                    )}
                    {section.visual === 'chart' && (
                      <>
                        <AnimatedCard className="rounded-none border-0 border-r border-border shadow-none">
                          <CardVisual>
                            <Visual3 mainColor="#14b8a6" secondaryColor="#0d9488" />
                          </CardVisual>
                          <CardBody>
                            <CardTitle>Lead performance at a glance</CardTitle>
                            <CardDescription>Hover to explore conversion trends.</CardDescription>
                          </CardBody>
                        </AnimatedCard>
                        <div className="flex flex-col justify-center px-6 py-8 md:px-8">
                          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary w-fit mb-4">
                            {section.tag}
                          </div>
                          <h2 className="text-2xl font-semibold tracking-tight">{section.title}</h2>
                          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{section.description}</p>
                          <ul className="mt-5 space-y-2.5">
                            {section.features.map((f) => (
                              <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                                <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                                {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                /* Text-only feature sections */
                <div className="rounded-2xl border border-border bg-card p-8 md:p-10 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary w-fit mb-4">
                    {section.tag}
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight">{section.title}</h2>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-2xl">{section.description}</p>
                  <div className="mt-8 grid sm:grid-cols-2 gap-3">
                    {section.features.map((f) => (
                      <div
                        key={f}
                        className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-4 py-3"
                      >
                        <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                        <span className="text-sm text-muted-foreground">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        ))}

        {/* CTA */}
        <section className="py-24 px-6 border-t border-border">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-4 py-1.5 text-xs font-semibold text-primary mb-6">
              <Zap size={12} />
              7-day free trial — no card required
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
              Ready to run a cleaner leasing workflow?
            </h2>
            <p className="mt-5 text-muted-foreground text-lg">
              Get your intake link live in minutes and start collecting structured renter data today.
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
