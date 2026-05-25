'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  MessageCircle,
  Zap,
  Bot,
  Link2,
  BarChart3,
  Users,
  TrendingUp,
  ClipboardList,
  Gauge,
} from 'lucide-react';
import { Navbar } from '@/components/navbar';
import AnimatedFooter from '@/components/ui/animated-footer';

const planFeatures = [
  { icon: Link2, label: 'Custom intake link', description: 'One shareable link for all renter inquiries' },
  { icon: ClipboardList, label: 'Structured lead capture', description: 'Budget, timeline, neighborhoods & household size' },
  { icon: Bot, label: 'AI lead scoring', description: 'Multi-signal scoring with plain-language context' },
  { icon: Gauge, label: 'Priority tiers', description: 'Hot / warm / cold ranking updated automatically' },
  { icon: Users, label: 'Contact CRM', description: 'Full profiles, activity logs & email history' },
  { icon: TrendingUp, label: 'Deal pipeline', description: 'Kanban board with stages, values & close dates' },
  { icon: BarChart3, label: 'Analytics dashboard', description: 'Volume, conversion rates & pipeline health' },
  { icon: MessageCircle, label: 'Full follow-up workflow', description: 'Notes, calls, emails & follow-up scheduling' },
];

type ComparisonCellValue = boolean | 'partial';
const comparison: Array<{
  feature: string;
  chippi: ComparisonCellValue;
  spreadsheet: ComparisonCellValue;
  crm: ComparisonCellValue;
}> = [
  { feature: 'Structured intake form', chippi: true, spreadsheet: false, crm: 'partial' },
  { feature: 'AI lead scoring', chippi: true, spreadsheet: false, crm: false },
  { feature: 'Priority tiers with context', chippi: true, spreadsheet: false, crm: false },
  { feature: 'Contact CRM', chippi: true, spreadsheet: false, crm: true },
  { feature: 'Deal pipeline', chippi: true, spreadsheet: 'partial', crm: true },
  { feature: 'Analytics', chippi: true, spreadsheet: 'partial', crm: true },
  { feature: 'Built for leasing leads', chippi: true, spreadsheet: false, crm: false },
  { feature: 'Setup in minutes', chippi: true, spreadsheet: 'partial', crm: false },
];

const faqs = [
  {
    q: 'Is there really a free trial?',
    a: 'Yes. Every new account starts with a 7-day free trial. No credit card required to sign up.',
  },
  {
    q: 'What happens after the trial?',
    a: 'You can subscribe for $97/month to keep access to everything. If you don\'t subscribe, your account is paused — no automatic charges.',
  },
  {
    q: 'Can I cancel any time?',
    a: 'Yes. You can cancel your subscription at any time from your account settings. No lock-in, no cancellation fees.',
  },
  {
    q: 'Is this just for solo agents?',
    a: 'Chippi is designed for solo operators and small teams. Each workspace is a single account with one intake link and one command center.',
  },
  {
    q: 'Do I need to replace my current CRM?',
    a: 'No. Many agents start Chippi as a leasing command center first, then decide what to sync or keep elsewhere.',
  },
];

function ComparisonCell({ value }: { value: boolean | 'partial' }) {
  if (value === true) return <CheckCircle2 size={18} className="text-primary mx-auto" />;
  if (value === 'partial') return <span className="text-muted-foreground text-xs font-medium">Partial</span>;
  return <XCircle size={18} className="text-muted-foreground/40 mx-auto" />;
}

export default function PricingPage() {
  return (
    <div className="min-h-svh w-full bg-background text-foreground">
      <Navbar />
      <main className="relative overflow-x-hidden">
        {/* Hero glow */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(20,184,166,0.1),transparent_70%)]" />

        {/* Page hero */}
        <section className="px-6 pt-36 pb-16 text-center">
          <div className="mx-auto max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-4 py-1.5 text-xs font-semibold text-primary mb-6">
              <Zap size={12} />
              Simple, honest pricing
            </div>
            <h1 className="font-title text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
              One plan.<br /> Everything included.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto">
              No tiers. No feature gates. No surprises. Flat monthly rate with a 7-day free trial — cancel any time.
            </p>
          </div>
        </section>

        {/* Pricing card */}
        <section className="px-6 pb-20">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-[1fr_1.2fr] gap-6">
              {/* Price */}
              <div className="rounded-2xl border border-primary/20 bg-card shadow-[0_4px_24px_-8px_rgba(13,148,136,0.3)] p-8 md:p-10 flex flex-col">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">Chippi Pro</p>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-6xl font-bold tracking-tight">$97</span>
                  <span className="text-muted-foreground text-xl mb-2">/ mo</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">7-day free trial · No credit card required</p>
                <p className="mt-1 text-sm text-muted-foreground">Cancel any time</p>

                <div className="mt-8 space-y-1">
                  <Link
                    href="/sign-up"
                    className="flex w-full items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-full font-semibold hover:opacity-90 transition-opacity"
                  >
                    Start 7-day free trial <MessageCircle size={15} />
                  </Link>
                  <Link
                    href="/login/realtor"
                    className="flex w-full items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
                  >
                    Already have an account? Log in
                  </Link>
                </div>

                <div className="mt-8 pt-6 border-t border-border">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">What you get</p>
                  <ul className="space-y-2">
                    {['Custom intake link', 'AI scoring on every lead', 'Full CRM & pipeline', 'Analytics dashboard', 'Unlimited leads'].map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 size={13} className="text-primary flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Feature list */}
              <div className="rounded-2xl border border-border bg-card p-8 md:p-10">
                <p className="text-sm font-semibold text-foreground mb-6">All features included:</p>
                <div className="space-y-4">
                  {planFeatures.map((f) => (
                    <div key={f.label} className="flex items-start gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 text-primary flex-shrink-0 mt-0.5">
                        <f.icon size={15} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{f.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Comparison table */}
        <section className="px-6 py-20 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">How we compare</p>
            <h2 className="text-3xl font-semibold tracking-tight mb-10">
              Built for the way leasing actually works.
            </h2>

            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-6 py-4 text-left font-semibold text-foreground">Feature</th>
                    <th className="px-4 py-4 text-center font-semibold text-primary">Chippi</th>
                    <th className="px-4 py-4 text-center font-medium text-muted-foreground">Spreadsheet</th>
                    <th className="px-4 py-4 text-center font-medium text-muted-foreground">Generic CRM</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row, idx) => (
                    <tr key={row.feature} className={`border-b border-border last:border-0 ${idx % 2 === 0 ? '' : 'bg-muted/30'}`}>
                      <td className="px-6 py-4 text-muted-foreground">{row.feature}</td>
                      <td className="px-4 py-4 text-center">
                        <ComparisonCell value={row.chippi} />
                      </td>
                      <td className="px-4 py-4 text-center">
                        <ComparisonCell value={row.spreadsheet} />
                      </td>
                      <td className="px-4 py-4 text-center">
                        <ComparisonCell value={row.crm} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Pricing FAQ */}
        <section className="px-6 py-20 border-t border-border">
          <div className="max-w-3xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Common questions</p>
            <h2 className="text-3xl font-semibold tracking-tight mb-10">Pricing questions, answered.</h2>
            <div className="space-y-4">
              {faqs.map((faq) => (
                <div key={faq.q} className="rounded-xl border border-border bg-card px-6 py-5">
                  <p className="font-medium text-foreground">{faq.q}</p>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
            <p className="mt-8 text-sm text-muted-foreground text-center">
              More questions?{' '}
              <Link href="/faq" className="text-primary hover:opacity-80 transition-opacity">
                See our full FAQ →
              </Link>
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 px-6 border-t border-border">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
              Try Chippi free for 7 days.
            </h2>
            <p className="mt-5 text-muted-foreground text-lg">
              No credit card. No commitment. Your intake link can be live in minutes.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3.5 rounded-full font-semibold hover:opacity-90 transition-opacity shadow-sm"
              >
                Start free trial <ArrowRight size={16} />
              </Link>
              <Link
                href="/features"
                className="inline-flex items-center gap-2 border border-border px-8 py-3.5 rounded-full font-medium hover:bg-card transition-colors"
              >
                View all features <ArrowRight size={16} />
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
