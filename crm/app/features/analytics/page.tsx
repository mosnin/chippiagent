'use client';

import Link from 'next/link';
import {
  ArrowRight,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Zap,
  TrendingUp,
  Users,
  Link2,
  Bot,
  Clock,
  Percent,
  Activity,
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

const metrics = [
  {
    icon: Activity,
    label: 'Lead volume',
    value: '47',
    sub: 'submissions this month',
    trend: '+18%',
    up: true,
  },
  {
    icon: Percent,
    label: 'Qualification rate',
    value: '62%',
    sub: 'leads scored warm or hot',
    trend: '+5%',
    up: true,
  },
  {
    icon: Clock,
    label: 'Avg. time to follow-up',
    value: '1.4h',
    sub: 'from submission to contact',
    trend: '-22%',
    up: false,
  },
  {
    icon: TrendingUp,
    label: 'Pipeline value',
    value: '$124k',
    sub: 'active deal value',
    trend: '+31%',
    up: true,
  },
];

const analyticsFeatures = [
  'Lead intake volume by day, week, and month',
  'Qualified vs. disqualified conversion ratio',
  'Score tier distribution (hot / warm / cold)',
  'Average time from submission to first contact',
  'Pipeline stage distribution across active deals',
  'Total active deal value and close rate',
  'Follow-up completion and overdue rate',
  'Month-over-month trend comparisons',
];

const useCases = [
  {
    title: 'Understand your intake funnel',
    body: 'See which days and weeks drive the most leads so you can time your marketing and bio link updates for peak volume.',
  },
  {
    title: 'Spot qualification gaps',
    body: 'If your hot rate is low, it may signal a targeting issue in your listing descriptions or intake form. Analytics surfaces the signal.',
  },
  {
    title: 'Optimize follow-up speed',
    body: 'Track how fast you\'re contacting new leads and watch conversion improve as response times drop.',
  },
  {
    title: 'Measure deal momentum',
    body: 'Pipeline value and stage distribution show exactly where deals are stalling and where you\'re closing fastest.',
  },
];

const relatedFeatures = [
  { href: '/features/intake', icon: Link2, name: 'Intake Link', description: 'The data that feeds analytics' },
  { href: '/features/ai-scoring', icon: Bot, name: 'AI Scoring', description: 'Score distribution over time' },
  { href: '/features/pipeline', icon: TrendingUp, name: 'Deal Pipeline', description: 'Pipeline value and stages' },
];

export default function AnalyticsPage() {
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
                  <BarChart3 size={11} />
                  Analytics
                </div>
                <h1 className="font-title text-4xl md:text-5xl font-bold tracking-tight leading-[1.08]">
                  See the full picture of your leasing workflow.
                </h1>
                <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
                  Track intake volume, qualification rates, conversion trends, follow-up performance, and pipeline health — all in one dashboard with no spreadsheet required.
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

              <AnimatedCard className="h-full min-h-[280px]">
                <CardVisual>
                  <Visual3 mainColor="#14b8a6" secondaryColor="#0d9488" />
                </CardVisual>
                <CardBody>
                  <CardTitle>Lead performance at a glance</CardTitle>
                  <CardDescription>Hover to explore conversion trends.</CardDescription>
                </CardBody>
              </AnimatedCard>
            </div>
          </div>
        </section>

        {/* Key metrics */}
        <section className="px-6 py-20 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Key metrics</p>
            <h2 className="text-3xl font-semibold tracking-tight mb-10">
              The numbers that actually matter.
            </h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
              {metrics.map((m) => (
                <div
                  key={m.label}
                  className="rounded-xl border border-border bg-card px-5 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.05)]"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 text-primary">
                      <m.icon size={15} />
                    </div>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        m.up ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {m.trend}
                    </span>
                  </div>
                  <p className="text-2xl font-bold tabular-nums">{m.value}</p>
                  <p className="text-xs font-medium text-foreground mt-0.5">{m.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What you can measure */}
        <section className="px-6 py-20 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">What you can measure</p>
                <h2 className="text-3xl font-semibold tracking-tight mb-5">
                  Eight key metrics, one dashboard.
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Chippi tracks every meaningful data point across your intake, scoring, CRM, and pipeline — and surfaces it all in a clean analytics view so you can act on what you see.
                </p>
              </div>
              <div className="space-y-2.5">
                {analyticsFeatures.map((f) => (
                  <div
                    key={f}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                  >
                    <CheckCircle2 size={13} className="text-primary flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section className="px-6 py-20 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">How agents use it</p>
            <h2 className="text-3xl font-semibold tracking-tight mb-10">
              Data you can act on — not just report on.
            </h2>
            <div className="grid sm:grid-cols-2 gap-5">
              {useCases.map((uc) => (
                <div
                  key={uc.title}
                  className="rounded-xl border border-border bg-card px-6 py-6 shadow-[0_1px_4px_rgba(0,0,0,0.05)]"
                >
                  <h3 className="font-semibold mb-2">{uc.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{uc.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* No spreadsheet needed */}
        <section className="px-6 py-20 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <div className="rounded-2xl border border-primary/20 bg-card p-8 md:p-10 shadow-[0_4px_24px_-8px_rgba(13,148,136,0.2)]">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Zero setup</p>
                  <h2 className="text-2xl font-semibold tracking-tight mb-4">
                    Your analytics are automatic from day one.
                  </h2>
                  <p className="text-muted-foreground leading-relaxed text-sm">
                    No formulas to maintain. No exports to run. Chippi tracks everything as you work — intake submissions, scoring events, stage changes, and deal updates all feed the dashboard automatically.
                  </p>
                </div>
                <div className="space-y-3">
                  {[
                    'Works from the moment you receive your first lead',
                    'No manual data entry into a spreadsheet',
                    'Updates in real time as new leads arrive',
                    'Trends build as your volume grows',
                    'Available from any device at any time',
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                      <CheckCircle2 size={13} className="text-primary flex-shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
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
              Know your numbers from day one.
            </h2>
            <p className="mt-5 text-muted-foreground text-lg">
              Start your free trial and watch your intake and pipeline analytics populate automatically.
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
