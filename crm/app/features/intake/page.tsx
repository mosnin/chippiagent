'use client';

import Link from 'next/link';
import {
  ArrowRight,
  ArrowLeft,
  Link2,
  CheckCircle2,
  Zap,
  ClipboardList,
  Share2,
  StickyNote,
  Users,
  Bot,
  TrendingUp,
  BarChart3,
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
  AnimatedCard as AnimatedCard3,
  CardVisual as CardVisual3,
  CardBody as CardBody3,
  CardTitle as CardTitle3,
  CardDescription as CardDescription3,
  Visual1,
} from '@/components/ui/animated-card-line';

const steps = [
  {
    step: '01',
    title: 'Get your intake link',
    body: 'After onboarding, Chippi generates a unique intake link tied to your workspace. Share it anywhere renters might discover you.',
  },
  {
    step: '02',
    title: 'Renter fills out the form',
    body: 'The guided form captures name, budget, move-in date, target neighborhoods, household size, pets, and any notes. No login required.',
  },
  {
    step: '03',
    title: 'Lead record created instantly',
    body: 'Every submission lands as a clean, structured lead record in your dashboard — scored and ready for follow-up action.',
  },
  {
    step: '04',
    title: 'Follow up from one place',
    body: 'All lead context, scoring notes, and activity history live on one record. No more piecing together scattered DMs and texts.',
  },
];

const whatYouCapture = [
  'Full name & contact info',
  'Monthly budget range',
  'Target move-in date',
  'Preferred neighborhoods',
  'Number of bedrooms needed',
  'Household size & composition',
  'Pet and parking requirements',
  'Additional notes from the renter',
];

const relatedFeatures = [
  { href: '/features/ai-scoring', icon: Bot, name: 'AI Scoring', description: 'Every intake is scored automatically' },
  { href: '/features/crm', icon: Users, name: 'Contact CRM', description: 'All lead context in one profile' },
  { href: '/features/analytics', icon: BarChart3, name: 'Analytics', description: 'Track intake volume over time' },
];

export default function IntakePage() {
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
                  <Link2 size={11} />
                  Intake
                </div>
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-[1.08]">
                  One link captures every renter inquiry.
                </h1>
                <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
                  Share a single intake link in your bio, listing replies, or email signature. Every renter fills out the same structured form — and every submission lands as a clean, actionable lead record.
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

              <AnimatedCard3 className="h-full min-h-[280px]">
                <CardVisual3>
                  <Visual1 mainColor="#14b8a6" secondaryColor="#0d9488" />
                </CardVisual3>
                <CardBody3>
                  <CardTitle3>Intake pipeline over time</CardTitle3>
                  <CardDescription3>Hover to see weekly qualification volume.</CardDescription3>
                </CardBody3>
              </AnimatedCard3>
            </div>
          </div>
        </section>

        {/* What you capture */}
        <section className="px-6 py-20 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Structured data</p>
                <h2 className="text-3xl font-semibold tracking-tight mb-5">
                  Every field that matters, captured automatically.
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  The intake form guides renters through each qualification detail. No freeform text boxes, no important context buried in a DM — just clean, consistent records every time.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {whatYouCapture.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3"
                  >
                    <CheckCircle2 size={13} className="text-primary flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">{item}</span>
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
              From share to structured lead in minutes.
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

        {/* Why it matters */}
        <section className="px-6 py-20 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <div className="rounded-2xl border border-border bg-card p-8 md:p-10 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="grid md:grid-cols-3 gap-8">
                <div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/8 text-primary mb-4">
                    <Share2 size={18} />
                  </div>
                  <h3 className="font-semibold mb-2">Drop it anywhere</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Instagram bio, email signature, listing replies, MLS descriptions — one link works in every context.
                  </p>
                </div>
                <div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/8 text-primary mb-4">
                    <ClipboardList size={18} />
                  </div>
                  <h3 className="font-semibold mb-2">No login for renters</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Renters submit without creating an account. Frictionless entry means higher completion rates.
                  </p>
                </div>
                <div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/8 text-primary mb-4">
                    <StickyNote size={18} />
                  </div>
                  <h3 className="font-semibold mb-2">Instant lead records</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Each submission creates a fully structured record in your dashboard — no copy-paste, no manual entry.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Related features */}
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
              Get your intake link live today.
            </h2>
            <p className="mt-5 text-muted-foreground text-lg">
              Onboard in minutes and start collecting structured renter data from your very first submission.
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
