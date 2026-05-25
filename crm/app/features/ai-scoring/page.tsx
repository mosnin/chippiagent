'use client';

import Link from 'next/link';
import {
  ArrowRight,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Zap,
  Flame,
  Thermometer,
  Snowflake,
  HelpCircle,
  Link2,
  Users,
  BarChart3,
} from 'lucide-react';
import { Navbar } from '@/components/navbar';
import AnimatedFooter from '@/components/ui/animated-footer';
import {
  AnimatedCard as AnimatedCard2,
  CardVisual as CardVisual2,
  CardBody as CardBody2,
  CardTitle as CardTitle2,
  CardDescription as CardDescription2,
  Visual2,
} from '@/components/ui/animated-card-diagram';

const scoreTiers = [
  {
    icon: Flame,
    label: 'Hot',
    color: 'text-red-500',
    bg: 'bg-red-500/10 border-red-500/20',
    description: 'Budget fits, timeline is immediate, neighborhood matches, household qualifies. Highest priority — reach out today.',
  },
  {
    icon: Thermometer,
    label: 'Warm',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10 border-amber-500/20',
    description: 'Strong signals but one or two softer points — like a flexible timeline or slightly stretched budget. Follow up this week.',
  },
  {
    icon: Snowflake,
    label: 'Cold',
    color: 'text-blue-400',
    bg: 'bg-blue-400/10 border-blue-400/20',
    description: 'Significant mismatches in budget, timing, or area. Low conversion probability — deprioritize or nurture long-term.',
  },
  {
    icon: HelpCircle,
    label: 'Unscored',
    color: 'text-muted-foreground',
    bg: 'bg-muted border-border',
    description: 'Incomplete submission or insufficient data to score. Review manually and fill in missing details.',
  },
];

const scoringSignals = [
  'Budget fit vs. average market range in target areas',
  'Move-in timeline urgency and specificity',
  'Neighborhood preference alignment',
  'Bedroom count availability match',
  'Household size and pet/parking flags',
  'Completeness and quality of the submission',
];

const steps = [
  {
    step: '01',
    title: 'Renter submits intake form',
    body: 'All qualification details are captured through the structured intake form — budget, timeline, neighborhoods, household.',
  },
  {
    step: '02',
    title: 'AI reviews the context',
    body: 'Every signal in the submission is weighted and compared against the qualification criteria for your market.',
  },
  {
    step: '03',
    title: 'Score and summary assigned',
    body: 'A priority tier (hot/warm/cold) and plain-language summary are attached to the lead record immediately.',
  },
  {
    step: '04',
    title: 'You act with confidence',
    body: 'Open your dashboard and know exactly who to call first — and why — without reviewing every record manually.',
  },
];

const relatedFeatures = [
  { href: '/features/intake', icon: Link2, name: 'Intake Link', description: 'The data scoring is based on' },
  { href: '/features/crm', icon: Users, name: 'Contact CRM', description: 'Scores visible on every profile' },
  { href: '/features/analytics', icon: BarChart3, name: 'Analytics', description: 'Score distribution over time' },
];

export default function AIScoringPage() {
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

            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary mb-5">
                  <Bot size={11} />
                  AI Scoring
                </div>
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-[1.08]">
                  Know who to call before you pick up the phone.
                </h1>
                <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
                  Every intake submission is automatically scored across budget fit, timeline urgency, neighborhood match, and household criteria — with a plain-language summary attached so you always understand the score.
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

              <AnimatedCard2 className="h-full min-h-[280px]">
                <CardVisual2>
                  <Visual2 mainColor="#14b8a6" secondaryColor="#0d9488" />
                </CardVisual2>
                <CardBody2>
                  <CardTitle2>AI qualification breakdown</CardTitle2>
                  <CardDescription2>Hover to reveal scoring signals.</CardDescription2>
                </CardBody2>
              </AnimatedCard2>
            </div>
          </div>
        </section>

        {/* Score tiers */}
        <section className="px-6 py-20 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Priority tiers</p>
            <h2 className="text-3xl font-semibold tracking-tight mb-10">
              Four clear tiers. No ambiguity.
            </h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
              {scoreTiers.map((tier) => (
                <div
                  key={tier.label}
                  className={`rounded-xl border px-5 py-5 ${tier.bg}`}
                >
                  <div className={`flex items-center gap-2 mb-3 ${tier.color}`}>
                    <tier.icon size={18} />
                    <span className="font-semibold">{tier.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{tier.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Scoring signals */}
        <section className="px-6 py-20 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">What gets scored</p>
                <h2 className="text-3xl font-semibold tracking-tight mb-5">
                  Multi-signal scoring — not just a number.
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Chippi evaluates every meaningful qualification signal in the intake submission. The result isn&apos;t just a score — it&apos;s a summary you can read and act on immediately.
                </p>
                <div className="mt-6 rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Example summary</p>
                  <div className="rounded-lg bg-primary/8 border border-primary/20 p-4">
                    <p className="text-sm text-foreground leading-relaxed">
                      <span className="font-semibold text-primary">Warm lead.</span> Budget of $2,800 is slightly below the median for Midtown 2BRs. Move-in timeline is firm (Aug 1) which is a strong signal. No pets or parking requirements. Household of 2 adults qualifies. Recommend follow-up this week.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {scoringSignals.map((s) => (
                  <div
                    key={s}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                  >
                    <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="px-6 py-20 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">How it works</p>
            <h2 className="text-3xl font-semibold tracking-tight mb-10">
              From form submission to prioritized lead.
            </h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
              {steps.map((s) => (
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
              Stop guessing which leads to call.
            </h2>
            <p className="mt-5 text-muted-foreground text-lg">
              Start your free trial and let Chippi score every submission automatically from day one.
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
