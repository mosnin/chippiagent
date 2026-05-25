'use client';

import React from 'react';
import Link from 'next/link';
import { motion, type Variants } from 'framer-motion';
import { BrandLogo } from '@/components/brand-logo';
import {
  ArrowRight,
  CheckCircle2,
  Star,
  MessageCircle,
} from 'lucide-react';

// ── Testimonials ─────────────────────────────────────────────────────────────

const testimonials = [
  {
    text: "Chippi completely changed how I manage new leads. The AI scoring saves me hours every week — I know exactly who to call first.",
    name: 'Sarah M.',
    role: 'Residential Realtor',
    initials: 'SM',
  },
  {
    text: "I used to lose track of follow-ups constantly. Now my pipeline actually moves. Chippi is the first CRM I've actually stuck with.",
    name: 'James T.',
    role: "Buyer's Agent",
    initials: 'JT',
  },
  {
    text: "The intake form alone is worth it. My leads come in pre-scored and my brokerage team is way more organized.",
    name: 'Priya K.',
    role: 'Team Lead',
    initials: 'PK',
  },
];

// ── Avatar images for social proof stack ─────────────────────────────────────

const avatarImages = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?w=80&h=80&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=faces',
];

// ── Features for pricing card ────────────────────────────────────────────────

const includedFeatures = [
  { bold: 'AI lead scoring', rest: 'on every renter inquiry' },
  { bold: 'Unlimited leads', rest: 'and contacts in your CRM' },
  { bold: 'Custom intake forms', rest: 'that sync to your pipeline' },
  { bold: 'Automated follow-ups', rest: 'with smart scheduling' },
  { bold: 'Tour booking', rest: 'with calendar integration' },
  { bold: 'Full CRM', rest: 'with activity logs & email' },
  { bold: 'Deal pipeline', rest: 'with drag-and-drop stages' },
  { bold: 'Analytics dashboard', rest: 'with conversion tracking' },
  { bold: 'Team dashboards', rest: 'for brokerages' },
  { bold: 'Priority support', rest: 'via email' },
];

// ── Animation variants ───────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { delay: i * 0.08, duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  }),
} as Variants;

// ═════════════════════════════════════════════════════════════════════════════
// PAGE
// ═════════════════════════════════════════════════════════════════════════════

export default function TrialPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 backdrop-blur-lg bg-background/80 border-b border-border/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/">
            <BrandLogo className="h-5 sm:h-6" alt="Chippi" />
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            Start free trial
            <ArrowRight size={14} />
          </Link>
        </div>
      </nav>

      {/* ── Hero — split layout ───────────────────────────────────────────── */}
      <section className="px-6 pt-20 pb-16 sm:pt-28 sm:pb-24">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-20 items-center">
          {/* Left — headline */}
          <motion.div
            initial="hidden"
            animate="visible"
            className="space-y-2"
          >
            <motion.h1
              variants={fadeUp}
              custom={0}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08]"
            >
              Close Rentals
              <br />
              on{' '}
              <span className="text-primary">Auto-Pilot</span>
            </motion.h1>
          </motion.div>

          {/* Right — description + social proof */}
          <motion.div
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            <motion.p
              variants={fadeUp}
              custom={1}
              className="text-lg text-muted-foreground leading-relaxed max-w-md"
            >
              Chippi scores your leads with AI, automates follow-ups, and manages your rental pipeline — so you can focus on closing.
            </motion.p>

            {/* Avatar stack + stars */}
            <motion.div variants={fadeUp} custom={2} className="flex items-center gap-4">
              {/* Overlapping avatars */}
              <div className="flex -space-x-2.5">
                {avatarImages.map((src, i) => (
                  <motion.img
                    key={i}
                    src={src}
                    alt=""
                    width={36}
                    height={36}
                    className="w-9 h-9 rounded-full object-cover ring-2 ring-background"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 + i * 0.06, type: 'spring', stiffness: 300, damping: 20 }}
                  />
                ))}
              </div>

              {/* Stars + label */}
              <div>
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={14} className="fill-primary text-primary" />
                  ))}
                </div>
                <p className="text-sm font-medium text-foreground mt-0.5">
                  2,400+ Rentals Closed
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Pricing card — "All in One" ───────────────────────────────────── */}
      <section className="px-6 pb-20 sm:pb-28">
        <motion.div
          initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
          whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-5xl mx-auto"
        >
          <div className="rounded-2xl border border-border bg-card shadow-lg shadow-primary/5 overflow-hidden">
            <div className="grid md:grid-cols-[1fr_1.4fr]">
              {/* Left — price + CTA */}
              <div className="p-8 sm:p-10 flex flex-col">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl font-bold tracking-tight">All in One</h2>
                  <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    For rental agents
                  </span>
                </div>

                <div className="mt-6 flex items-end gap-2">
                  <span className="text-6xl font-bold tracking-tight">$97</span>
                  <div className="mb-2">
                    <span className="text-xl text-muted-foreground line-through">$200</span>
                    <span className="text-muted-foreground text-lg ml-1">/monthly</span>
                  </div>
                </div>

                <div className="mt-8">
                  <Link
                    href="/sign-up"
                    className="flex w-full items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-3.5 rounded-full text-base font-semibold shadow-md hover:bg-primary/90 hover:shadow-lg transition-all"
                  >
                    Start Free 7-day Trial
                    <ArrowRight size={16} />
                  </Link>
                </div>

                <p className="mt-3 text-sm text-muted-foreground text-center">
                  <span className="font-medium text-foreground">Cancel anytime.</span> No questions asked!
                </p>
              </div>

              {/* Right — feature list */}
              <div className="border-t md:border-t-0 md:border-l border-border p-8 sm:p-10">
                <p className="text-sm font-semibold text-foreground mb-5">What&apos;s included:</p>
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3.5">
                  {includedFeatures.map((f, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      className="flex items-start gap-2.5"
                    >
                      <CheckCircle2 size={16} className="text-primary flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-muted-foreground leading-snug">
                        <span className="font-semibold text-foreground">{f.bold}</span> {f.rest}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── Testimonials — horizontal cards ───────────────────────────────── */}
      <section className="px-6 pb-20 sm:pb-28">
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {testimonials.map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
                whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ delay: i * 0.08, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-xl border border-border bg-card p-6"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold flex-shrink-0">
                      {t.initials}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground leading-tight">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </div>
                  {/* X/Twitter icon */}
                  <svg viewBox="0 0 24 24" className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </div>
                {/* Quote */}
                <p className="text-sm text-muted-foreground leading-relaxed">{t.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section className="px-6 pb-20 sm:pb-28">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-2xl mx-auto text-center space-y-6"
        >
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">
            Ready to close more rentals?
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Set up in under 15 minutes. Start receiving scored leads today.
          </p>
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-base font-semibold text-primary-foreground shadow-md hover:bg-primary/90 hover:shadow-lg transition-all"
          >
            Start your 7-day free trial
            <ArrowRight size={14} />
          </Link>
          <p className="text-xs text-muted-foreground/70">
            No credit card required &middot; Cancel anytime &middot; Full access to all features
          </p>
        </motion.div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border py-8 text-center">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <BrandLogo className="h-4 opacity-60" alt="Chippi" />
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <Link href="/legal/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/login/realtor" className="hover:text-foreground transition-colors">Sign in</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
